/**
 * pages/AdminDashboard.jsx - Admin Control Center
 *
 * Features:
 * - Live stall heatmap (color-coded by load ratio)
 * - Per-stall queue management (call next, view queue)
 * - Analytics charts (hourly throughput, category breakdown)
 * - One-click rebalance trigger
 * - Broadcast notification sender
 * - Event management (create, activate, close)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/firebase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { adminAPI, eventAPI, stallAPI, queueAPI } from '../services/api';
import StallCard from '../components/StallCard';

const COLORS = ['#6c63ff', '#48d1cc', '#f72585', '#f59e0b', '#10b981'];

const AdminDashboard = () => {
  const { isAdmin, isAuthenticated } = useAuth();
  const navigate  = useNavigate();
  const toast     = useToast();

  const [events, setEvents]         = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [dashData, setDashData]     = useState(null);
  const [analytics, setAnalytics]   = useState(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [activeTab, setActiveTab]   = useState('heatmap'); // heatmap | analytics | manage
  const [broadcastForm, setBroadcastForm] = useState({ title: '', message: '' });
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [newEvent, setNewEvent] = useState({ name: '', venue: '', date: '', expectedCapacity: '' });
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);

  // Real-time State
  const [liveStalls, setLiveStalls] = useState({});
  const [liveTokens, setLiveTokens] = useState({});
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (!isAdmin) { navigate('/'); toast.error('Admin access required'); return; }
    fetchEvents();
  }, [isAuthenticated, isAdmin]);

  const fetchEvents = async () => {
    try {
      const res = await eventAPI.list();
      setEvents(res.data.events);
      // Auto-select the first active event
      const active = res.data.events.find((e) => e.status === 'active');
      if (active) { setSelectedEventId(active._id); }
    } catch {
      toast.error('Failed to load events');
    }
  };

  const fetchDashboard = useCallback(async () => {
    if (!selectedEventId) return;
    setIsLoading(true);
    try {
      const [dashRes, analyticsRes] = await Promise.all([
        adminAPI.getDashboard(selectedEventId),
        adminAPI.getAnalytics(selectedEventId),
      ]);
      setDashData(dashRes.data);
      setAnalytics(analyticsRes.data);
    } catch (error) {
      toast.error('Failed to load dashboard: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => {
    fetchDashboard();
    // Replaced HTTP polling with Firebase onSnapshot (below)
  }, [fetchDashboard]);

  // Initial token fetch for Live Queue
  useEffect(() => {
    if (!dashData?.stalls) return;
    dashData.stalls.forEach(async (stall) => {
      try {
        const res = await queueAPI.getStallQueue(stall._id);
        if (res.data?.tokens) {
          setLiveTokens(prev => {
            const next = { ...prev };
            res.data.tokens.forEach(t => {
              if (!next[t._id]) next[t._id] = t;
            });
            return next;
          });
        }
      } catch (e) {
        // silently ignore queue fetch errs
      }
    });
  }, [dashData?.stalls?.map(s => s._id).join(',')]);

  // Firebase Real-time listeners
  useEffect(() => {
    if (!selectedEventId || !db || !isFirebaseConfigured) return;

    // 1. Listen to Tokens
    const tokensQuery = query(collection(db, 'queueTokens'), where('eventId', '==', selectedEventId));
    const unsubTokens = onSnapshot(tokensQuery, (snapshot) => {
      setLiveTokens(prev => {
        const next = { ...prev };
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            next[change.doc.id] = { ...next[change.doc.id], ...change.doc.data() };
          }
          if (change.type === 'removed') {
            delete next[change.doc.id];
          }
        });
        return next;
      });
      setLastUpdated(Date.now());
    });

    // 2. Listen to Stalls
    const unsubStalls = [];
    if (dashData?.stalls) {
      dashData.stalls.forEach(stall => {
        const unsub = onSnapshot(doc(db, 'stalls', stall._id), (docSnap) => {
          if (docSnap.exists()) {
            setLiveStalls(prev => ({ ...prev, [stall._id]: docSnap.data().currentLoad }));
            setLastUpdated(Date.now());
          }
        });
        unsubStalls.push(unsub);
      });
    }

    return () => {
      unsubTokens();
      unsubStalls.forEach(fn => fn());
    };
  }, [selectedEventId, dashData?.stalls?.map(s => s._id).join(',')]);

  // Merge Data
  const mergedStalls = useMemo(() => {
    if (!dashData?.stalls) return [];
    return dashData.stalls.map(stall => {
      const currentLoad = liveStalls[stall._id] !== undefined ? liveStalls[stall._id] : stall.currentLoad;
      const loadRatio = stall.capacity > 0 ? currentLoad / stall.capacity : 1;
      return { ...stall, currentLoad, loadRatio };
    });
  }, [dashData?.stalls, liveStalls]);

  const liveTotalInQueue = mergedStalls.reduce((sum, s) => sum + s.currentLoad, 0);
  const liveAvgWait = mergedStalls.length ? Math.round(mergedStalls.reduce((sum, s) => sum + s.estimatedWaitMinutes, 0) / mergedStalls.length) : 0;
  
  const activeQueueFeed = useMemo(() => {
    return Object.values(liveTokens)
      .filter(t => t.status === 'waiting' || t.status === 'serving')
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'serving' ? -1 : 1;
        return (a.position || Infinity) - (b.position || Infinity);
      });
  }, [liveTokens]);

  const handleRebalance = async () => {
    setIsRebalancing(true);
    try {
      const res = await adminAPI.rebalance(selectedEventId);
      toast.success(res.message);
      fetchDashboard();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsRebalancing(false);
    }
  };

  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastForm.title || !broadcastForm.message) {
      toast.warning('Title and message are required');
      return;
    }
    setIsBroadcasting(true);
    try {
      await adminAPI.broadcast(selectedEventId, broadcastForm);
      toast.success('Broadcast sent!');
      setBroadcastForm({ title: '', message: '' });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleCallNext = async (stallId) => {
    try {
      const res = await queueAPI.callNextUser(stallId);
      toast.success(res.message);
      fetchDashboard();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleToggleStall = async (stallId) => {
    try {
      const res = await stallAPI.toggle(stallId);
      toast.success(res.message);
      fetchDashboard();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleEventStatus = async (eventId, status) => {
    try {
      await eventAPI.updateStatus(eventId, status);
      toast.success(`Event ${status}`);
      fetchEvents();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setIsCreatingEvent(true);
    try {
      await eventAPI.create({ ...newEvent, expectedCapacity: Number(newEvent.expectedCapacity) });
      toast.success('Event created!');
      setNewEvent({ name: '', venue: '', date: '', expectedCapacity: '' });
      fetchEvents();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsCreatingEvent(false);
    }
  };

  const getHeatStyle = (ratio) => {
    if (ratio >= 0.8) return { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', barColor: '#ef4444', label: '🔴 High' };
    if (ratio >= 0.5) return { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', barColor: '#f59e0b', label: '🟡 Medium' };
    return { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', barColor: '#10b981', label: '🟢 Low' };
  };

  return (
    <div className="page-content">
      <div className="container py-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>⚙️ Admin Dashboard</h1>
            <p className="text-muted text-sm">Real-time venue queue control center</p>
          </div>
          <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap' }}>
            <select
              id="event-selector"
              className="form-select"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              style={{ width: 'auto', minWidth: 220 }}
            >
              <option value="">Select Event</option>
              {events.map((ev) => (
                <option key={ev._id} value={ev._id}>{ev.name}</option>
              ))}
            </select>
            <button id="refresh-btn" className="btn btn-secondary btn-sm" onClick={fetchDashboard}>
              🔄 Refresh
            </button>
            <button
              id="rebalance-btn"
              className="btn btn-primary btn-sm"
              onClick={handleRebalance}
              disabled={isRebalancing || !selectedEventId}
            >
              {isRebalancing ? '⏳ Rebalancing...' : '⚖️ Rebalance'}
            </button>
            <div className="flex items-center gap-2" style={{ padding: '0.4rem 0.8rem', background: 'rgba(16,185,129,0.1)', border: '1px solid currentColor', color: '#10b981', borderRadius: 'var(--radius-full)', fontSize: '0.8rem', fontWeight: 600 }}>
              <span className="live-indicator-dot" style={{ width: 8, height: 8, background: 'currentColor', borderRadius: '50%', animation: 'fadeIn 0.8s infinite alternate' }}></span>
              Live
            </div>
          </div>
        </div>

        {dashData && (
          <div className="text-xs text-muted mb-4 text-right animate-pulse-glow" key={lastUpdated}>
            Last updated: {Math.floor((Date.now() - lastUpdated) / 1000)}s ago
          </div>
        )}

        {/* Stats Overview */}
        {dashData && (
          <div className="stats-grid mb-6 stagger">
            {[
              { label: 'In Queue',    value: liveTotalInQueue,   icon: '👥', color: 'var(--accent-purple)' },
              { label: 'Total Served', value: dashData.overview.totalServed,   icon: '✅', color: '#10b981' },
              { label: 'Avg Wait',    value: `${liveAvgWait}m`, icon: '⏱️', color: 'var(--accent-cyan)' },
              { label: 'Open Stalls', value: `${dashData.overview.openStalls}/${dashData.overview.totalStalls}`, icon: '🏪', color: '#f59e0b' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="stat-card animate-fade-up" aria-live="polite">
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{icon}</div>
                <div className="stat-value" style={{ color }} key={`${label}-${value}`}>{value}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0' }} role="tablist" aria-label="Dashboard views">
          {[
            { id: 'heatmap',   label: '🗺️ Heatmap'   },
            { id: 'analytics', label: '📊 Analytics'  },
            { id: 'manage',    label: '⚙️ Manage'     },
          ].map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '0.5rem 1rem',
                fontSize: '0.9rem', fontWeight: 600,
                color: activeTab === tab.id ? 'var(--accent-purple)' : 'var(--text-muted)',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent-purple)' : '2px solid transparent',
                transition: 'all 0.2s',
                marginBottom: '-1px',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="loading-overlay"><div className="spinner"></div></div>
        ) : !selectedEventId ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <h3>Select an Event</h3>
            <p className="text-secondary">Choose an event above to view its dashboard.</p>
          </div>
        ) : (
          <>
            {/* ── Tab: Heatmap ── */}
            {activeTab === 'heatmap' && dashData && (
              <div id="panel-heatmap" role="tabpanel" aria-labelledby="tab-heatmap" className="animate-fade-in">
                <div className="section-header">
                  <h2 className="section-title">Stall Load Heatmap</h2>
                  <div className="flex gap-3 text-xs text-muted">
                    <span style={{ color: '#10b981' }}>● Low</span>
                    <span style={{ color: '#f59e0b' }}>● Medium</span>
                    <span style={{ color: '#ef4444' }}>● High</span>
                  </div>
                </div>

                <div className="heatmap-grid stagger">
                  {mergedStalls.map((stall) => {
                    const heat = getHeatStyle(stall.loadRatio);
                    return (
                      <div
                        key={stall._id}
                        className="heatmap-card"
                        style={{ background: heat.bg, borderColor: heat.border }}
                      >
                        {/* Stall Header */}
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{stall.name}</div>
                            <div className="text-xs text-muted">{stall.location}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span style={{ fontWeight: 600, fontSize: '0.75rem', color: heat.barColor }}>{heat.label}</span>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex gap-3 mb-3 text-center" aria-live="polite">
                          {[
                            { label: 'Load', value: `${stall.currentLoad}/${stall.capacity}`, key: stall.currentLoad },
                            { label: 'Wait', value: `~${stall.estimatedWaitMinutes}m`, key: stall.estimatedWaitMinutes },
                            { label: 'Served', value: stall.totalServed, key: stall.totalServed },
                          ].map(({ label, value, key }) => (
                            <div key={label} style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: '0.95rem' }} className="animate-pulse-glow" key={key}>{value}</div>
                              <div className="text-xs text-muted">{label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Load Bar */}
                        <div className="heatmap-bar-track mb-3" aria-hidden="true">
                          <div
                            className="heatmap-bar-fill"
                            style={{
                              width: `${Math.min(stall.loadRatio * 100, 100)}%`,
                              background: heat.barColor,
                              boxShadow: `0 0 8px ${heat.barColor}80`,
                              transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <button
                            id={`call-next-${stall._id}`}
                            className="btn btn-success btn-sm"
                            style={{ flex: 1, fontSize: '0.75rem' }}
                            onClick={() => handleCallNext(stall._id)}
                            disabled={stall.currentLoad === 0}
                          >
                            📞 Call Next
                          </button>
                          <button
                            id={`toggle-stall-${stall._id}`}
                            className="btn btn-secondary btn-sm"
                            style={{ flex: 1, fontSize: '0.75rem' }}
                            onClick={() => handleToggleStall(stall._id)}
                          >
                            {stall.isOpen ? '🔒 Close' : '🔓 Open'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Live Queue Feed */}
                <div className="card mt-6">
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>📺 Live Queue Feed</h3>
                  <div className="live-feed-container" style={{ maxHeight: 300, overflowY: 'auto', background: 'var(--color-bg)', padding: '0.5rem', borderRadius: '12px' }}>
                    {activeQueueFeed.length > 0 ? activeQueueFeed.map(token => {
                      const stall = mergedStalls.find(s => s._id === token.stallId);
                      return (
                        <div key={token._id} className="flex justify-between items-center animate-fade-up" style={{ padding: '0.75rem', borderBottom: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
                          <div className="flex items-center gap-3">
                            <div style={{ width: 32, height: 32, background: token.status === 'serving' ? 'rgba(16,185,129,0.1)' : 'var(--color-bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontWeight: 700, color: token.status === 'serving' ? '#10b981' : 'currentColor' }}>
                              #{token.position}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600 }}>{token.tokenNumber || 'Token'}</div>
                              <div className="text-xs text-muted">{stall?.name || token.stallName || 'Unknown Stall'}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`badge badge-${token.status}`} style={{ transform: 'scale(0.8)', transformOrigin: 'right center' }}>{token.status}</span>
                            <div className="text-xs text-muted mt-1">{token.estimatedWaitMinutes}m wait</div>
                          </div>
                        </div>
                      )
                    }) : (
                      <div className="empty-state text-sm" style={{ padding: '2rem 0' }}>All queues are currently empty.</div>
                    )}
                  </div>
                </div>

                {/* Broadcast Panel */}
                <div className="card mt-6">
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>📢 Broadcast Notification</h3>
                  <form onSubmit={handleBroadcast} id="broadcast-form">
                    <div className="grid-2 mb-4">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Title</label>
                        <input
                          id="broadcast-title"
                          className="form-input"
                          placeholder="Halftime break!"
                          value={broadcastForm.title}
                          onChange={(e) => setBroadcastForm(p => ({ ...p, title: e.target.value }))}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Message</label>
                        <input
                          id="broadcast-message"
                          className="form-input"
                          placeholder="All stalls are now open..."
                          value={broadcastForm.message}
                          onChange={(e) => setBroadcastForm(p => ({ ...p, message: e.target.value }))}
                        />
                      </div>
                    </div>
                    <button
                      id="broadcast-send-btn"
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={isBroadcasting}
                    >
                      {isBroadcasting ? 'Sending...' : '📤 Send to All Users'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* ── Tab: Analytics ── */}
            {activeTab === 'analytics' && analytics && (
              <div id="panel-analytics" role="tabpanel" aria-labelledby="tab-analytics" className="animate-fade-in">
                <div className="grid-2 gap-6">
                  {/* Hourly throughput chart */}
                  <div className="card">
                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>📈 Hourly Throughput</h3>
                    {analytics.hourlyThroughput?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={analytics.hourlyThroughput.map(d => ({ hour: `${d._id}:00`, served: d.count }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="hour" tick={{ fill: '#a0a0c0', fontSize: 11 }} axisLine={false} />
                          <YAxis tick={{ fill: '#a0a0c0', fontSize: 11 }} axisLine={false} />
                          <Tooltip
                            contentStyle={{ background: '#1a1a30', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                            labelStyle={{ color: '#f0f0ff' }}
                          />
                          <Bar dataKey="served" fill="#6c63ff" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="empty-state" style={{ padding: '2rem 0' }}>
                        <p className="text-muted text-sm">No throughput data yet</p>
                      </div>
                    )}
                  </div>

                  {/* Category breakdown pie */}
                  <div className="card">
                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>🥧 Category Breakdown</h3>
                    {analytics.categoryBreakdown?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={analytics.categoryBreakdown.map(d => ({ name: d._id, value: d.total }))}
                            cx="50%" cy="50%"
                            outerRadius={80}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={{ stroke: 'rgba(255,255,255,0.2)' }}
                          >
                            {analytics.categoryBreakdown.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: '#1a1a30', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="empty-state" style={{ padding: '2rem 0' }}>
                        <p className="text-muted text-sm">No category data yet</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status summary */}
                {dashData && (
                  <div className="card mt-5">
                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>🔢 Token Status Summary</h3>
                    <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
                      {Object.entries(dashData.tokenSummary).map(([status, count]) => (
                        <div key={status} style={{ textAlign: 'center', minWidth: 70 }}>
                          <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{count}</div>
                          <span className={`badge badge-${status}`}>{status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Manage ── */}
            {activeTab === 'manage' && (
              <div id="panel-manage" role="tabpanel" aria-labelledby="tab-manage" className="animate-fade-in">
                {/* Events List */}
                <div className="card mb-5">
                  <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>🏟️ Events</h3>
                  <div className="flex flex-col gap-3">
                    {events.map((ev) => (
                      <div key={ev._id} className="flex justify-between items-center" style={{
                        padding: '0.75rem', background: 'var(--color-bg-3)', borderRadius: 'var(--radius-md)',
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{ev.name}</div>
                          <div className="text-xs text-muted">{ev.venue}</div>
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className={`badge badge-${ev.status}`}>{ev.status}</span>
                          {ev.status === 'upcoming' && (
                            <button className="btn btn-success btn-sm" onClick={() => handleEventStatus(ev._id, 'active')}>
                              Activate
                            </button>
                          )}
                          {ev.status === 'active' && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleEventStatus(ev._id, 'closed')}>
                              Close
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Create Event Form */}
                <div className="card">
                  <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>➕ Create New Event</h3>
                  <form onSubmit={handleCreateEvent} id="create-event-form">
                    <div className="grid-2 mb-4">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Event Name</label>
                        <input id="event-name" className="form-input" placeholder="IPL Finals 2024"
                          value={newEvent.name} onChange={(e) => setNewEvent(p => ({ ...p, name: e.target.value }))} required />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Venue</label>
                        <input id="event-venue" className="form-input" placeholder="Wankhede Stadium"
                          value={newEvent.venue} onChange={(e) => setNewEvent(p => ({ ...p, venue: e.target.value }))} required />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Date & Time</label>
                        <input id="event-date" type="datetime-local" className="form-input"
                          value={newEvent.date} onChange={(e) => setNewEvent(p => ({ ...p, date: e.target.value }))} required />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Expected Capacity</label>
                        <input id="event-capacity" type="number" className="form-input" placeholder="45000"
                          value={newEvent.expectedCapacity} onChange={(e) => setNewEvent(p => ({ ...p, expectedCapacity: e.target.value }))} required />
                      </div>
                    </div>
                    <button id="create-event-btn" type="submit" className="btn btn-primary btn-sm" disabled={isCreatingEvent}>
                      {isCreatingEvent ? 'Creating...' : '➕ Create Event'}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
