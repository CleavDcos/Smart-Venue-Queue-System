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

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
    const interval = setInterval(fetchDashboard, 15000); // Refresh every 15s
    return () => clearInterval(interval);
  }, [fetchDashboard]);

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
    if (ratio >= 0.8) return { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', barColor: '#ef4444' };
    if (ratio >= 0.5) return { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', barColor: '#f59e0b' };
    return { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', barColor: '#10b981' };
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
          </div>
        </div>

        {/* Stats Overview */}
        {dashData && (
          <div className="stats-grid mb-6 stagger">
            {[
              { label: 'In Queue',    value: dashData.overview.totalInQueue,   icon: '👥', color: 'var(--accent-purple)' },
              { label: 'Total Served', value: dashData.overview.totalServed,   icon: '✅', color: '#10b981' },
              { label: 'Avg Wait',    value: `${dashData.overview.avgWaitMinutes}m`, icon: '⏱️', color: 'var(--accent-cyan)' },
              { label: 'Open Stalls', value: `${dashData.overview.openStalls}/${dashData.overview.totalStalls}`, icon: '🏪', color: '#f59e0b' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="stat-card animate-fade-up">
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{icon}</div>
                <div className="stat-value" style={{ color }}>{value}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0' }}>
          {[
            { id: 'heatmap',   label: '🗺️ Heatmap'   },
            { id: 'analytics', label: '📊 Analytics'  },
            { id: 'manage',    label: '⚙️ Manage'     },
          ].map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
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
              <div className="animate-fade-in">
                <div className="section-header">
                  <h2 className="section-title">Stall Load Heatmap</h2>
                  <div className="flex gap-3 text-xs text-muted">
                    <span style={{ color: '#10b981' }}>● Low</span>
                    <span style={{ color: '#f59e0b' }}>● Medium</span>
                    <span style={{ color: '#ef4444' }}>● High</span>
                  </div>
                </div>

                <div className="heatmap-grid stagger">
                  {dashData.stalls.map((stall) => {
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
                          <div className="flex flex-col items-center gap-1">
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: stall.isOpen ? '#10b981' : '#6b7280',
                            }}></span>
                            <span className="text-xs text-muted">{stall.isOpen ? 'Open' : 'Closed'}</span>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex gap-3 mb-3 text-center">
                          {[
                            { label: 'Load', value: `${stall.currentLoad}/${stall.capacity}` },
                            { label: 'Wait', value: `~${stall.estimatedWaitMinutes}m` },
                            { label: 'Served', value: stall.totalServed },
                          ].map(({ label, value }) => (
                            <div key={label} style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{value}</div>
                              <div className="text-xs text-muted">{label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Load Bar */}
                        <div className="heatmap-bar-track mb-3">
                          <div
                            className="heatmap-bar-fill"
                            style={{
                              width: `${Math.min(stall.loadRatio * 100, 100)}%`,
                              background: heat.barColor,
                              boxShadow: `0 0 8px ${heat.barColor}80`,
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
              <div className="animate-fade-in">
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
              <div className="animate-fade-in">
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
