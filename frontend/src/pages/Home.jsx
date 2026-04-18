/**
 * pages/Home.jsx - Events Landing Page + Queue Join Flow
 *
 * Shows active events, lets users pick a category, join the virtual queue,
 * and displays their generated QR-code token.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { eventAPI, queueAPI, stallAPI } from '../services/api';

const CATEGORIES = [
  { id: 'food',        icon: '🍔', label: 'Food',        desc: 'Snacks, meals, and more' },
  { id: 'beverage',    icon: '🥤', label: 'Beverages',   desc: 'Drinks & refreshments' },
  { id: 'merchandise', icon: '🛒', label: 'Merchandise', desc: 'Team gear & collectibles' },
  { id: 'medical',     icon: '🏥', label: 'Medical',     desc: 'First aid & medical help' },
  { id: 'information', icon: 'ℹ️', label: 'Information', desc: 'Event info & help desk' },
];

const Home = () => {
  const [events, setEvents]       = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedCat, setSelectedCat]     = useState(null);
  const [stalls, setStalls]       = useState([]);
  const [isJoining, setIsJoining] = useState(false);
  const [joinedToken, setJoinedToken] = useState(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [step, setStep] = useState(1); // 1: pick event, 2: pick category, 3: success

  const { isAuthenticated } = useAuth();
  const toast    = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const res = await eventAPI.list({ status: 'active' });
      setEvents(res.data.events);
    } catch {
      toast.error('Failed to load events');
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const handleSelectEvent = async (event) => {
    setSelectedEvent(event);
    setStep(2);
    try {
      const res = await stallAPI.listByEvent(event._id);
      setStalls(res.data.stalls);
    } catch {
      toast.error('Failed to load stall info');
    }
  };

  const handleJoinQueue = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: '/' } } });
      return;
    }
    if (!selectedCat) { toast.warning('Please select a category'); return; }

    setIsJoining(true);
    try {
      const res = await queueAPI.joinQueue({
        eventId: selectedEvent._id,
        category: selectedCat,
      });
      setJoinedToken(res.data.token);
      setStep(3);
      toast.success(`You're in! Token ${res.data.token.tokenNumber} assigned 🎫`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsJoining(false);
    }
  };

  // ── Step 3: Success ────────────────────────────────────────────────────────
  if (step === 3 && joinedToken) {
    return (
      <div className="page-content">
        <div className="container-sm py-10">
          <div className="text-center mb-6 animate-fade-up">
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }} className="animate-float">🎫</div>
            <h2 style={{ marginBottom: '0.5rem' }}>You're In the Queue!</h2>
            <p className="text-secondary">Your virtual token has been assigned.</p>
          </div>

          <div className="token-card animate-fade-up" style={{ animationDelay: '100ms' }}>
            {/* Token Number */}
            <div className="text-center mb-5">
              <div className="token-number">{joinedToken.tokenNumber}</div>
              <span className="badge badge-waiting" style={{ marginTop: '0.5rem' }}>In Queue</span>
            </div>

            {/* QR Code */}
            {joinedToken.qrCode && (
              <div className="mb-5">
                <div className="text-center text-xs font-semibold text-muted mb-3" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Show this at the stall
                </div>
                <div className="qr-container">
                  <img src={joinedToken.qrCode} alt={`QR Code for token ${joinedToken.tokenNumber}`} />
                </div>
              </div>
            )}

            {/* Details */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem', marginBottom: '1.25rem',
            }}>
              {[
                { label: 'Position', value: `#${joinedToken.position}`, color: 'var(--accent-purple)' },
                { label: 'Est. Wait', value: `~${joinedToken.estimatedWaitMinutes} min`, color: 'var(--accent-cyan)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  background: 'var(--color-bg-3)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value}</div>
                  <div className="text-xs text-muted">{label}</div>
                </div>
              ))}
            </div>

            {/* Stall info */}
            <div style={{
              background: 'var(--color-bg-3)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
            }}>
              <div className="flex items-center gap-2 mb-1">
                <span>📍</span>
                <span style={{ fontWeight: 600 }}>{joinedToken.stall?.name}</span>
              </div>
              <p className="text-sm text-secondary" style={{ margin: 0 }}>{joinedToken.stall?.navigationInstructions}</p>
            </div>

            <div className="flex gap-3 mt-5">
              <button className="btn btn-primary btn-block" onClick={() => navigate('/queue')}>
                Track Live Status →
              </button>
              <button className="btn btn-secondary" onClick={() => { setStep(1); setSelectedEvent(null); setSelectedCat(null); setJoinedToken(null); }}>
                New
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Page ──────────────────────────────────────────────────────────────
  return (
    <div className="page-content">
      {/* Hero */}
      <div className="hero">
        <div className="container">
          <div className="hero-tag">
            <span>⚡</span> AI-Powered Queue System
          </div>
          <h1 className="hero-title mb-4">
            Skip the Line.<br />
            <span className="gradient-text">Join Virtually.</span>
          </h1>
          <p className="text-secondary mb-6" style={{ fontSize: '1.1rem', maxWidth: 520, margin: '0 auto 2rem' }}>
            Get a virtual queue token for your favourite stall. Our AI balances the load so you wait less and enjoy more.
          </p>

          {/* Feature Pills */}
          <div className="flex gap-3 justify-center" style={{ flexWrap: 'wrap' }}>
            {['🎯 Smart Assignment', '⏱️ Live Wait Times', '🔔 Push Alerts', '🔄 Auto Rebalance'].map((f) => (
              <span key={f} style={{
                padding: '0.35rem 0.9rem',
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: 'var(--text-secondary)',
              }}>{f}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Events Grid */}
      <div className="container py-8">

        {/* ── Step 1: Select Event ── */}
        <div className="section-header">
          <h2 className="section-title">🏟️ Active Events</h2>
          {step > 1 && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setStep(1); setSelectedEvent(null); setSelectedCat(null); }}>
              ← Back
            </button>
          )}
        </div>

        {isLoadingEvents ? (
          <div className="loading-overlay"><div className="spinner"></div><p className="text-muted">Loading events...</p></div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏟️</div>
            <h3>No Active Events</h3>
            <p className="text-secondary">Check back soon — events will appear here when live.</p>
          </div>
        ) : (
          <div className="heatmap-grid stagger">
            {events.map((event) => (
              <div
                key={event._id}
                id={`event-card-${event._id}`}
                className={`card card-hover ${selectedEvent?._id === event._id ? 'animate-pulse-glow' : ''}`}
                style={{
                  cursor: 'pointer',
                  borderColor: selectedEvent?._id === event._id ? 'var(--accent-purple)' : 'var(--color-border)',
                }}
                onClick={() => handleSelectEvent(event)}
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="badge badge-active">● Live</span>
                  <span className="text-xs text-muted">
                    {new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{event.name}</h3>
                <div className="flex items-center gap-1 text-sm text-muted">
                  <span>📍</span> {event.venue}
                </div>
                {selectedEvent?._id === event._id && (
                  <div className="mt-3 text-xs" style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>
                    ✓ Selected
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Step 2: Select Category ── */}
        {step >= 2 && selectedEvent && (
          <div className="mt-8 animate-fade-up">
            <div className="section-header">
              <h2 className="section-title">🍔 What do you need?</h2>
            </div>
            <div className="heatmap-grid stagger">
              {CATEGORIES.map((cat) => {
                const availableStalls = stalls.filter((s) => s.category === cat.id && s.isOpen);
                const minWait = availableStalls.length
                  ? Math.min(...availableStalls.map((s) => s.estimatedWaitMinutes || 0))
                  : null;

                return (
                  <div
                    key={cat.id}
                    id={`cat-${cat.id}`}
                    className="card card-hover"
                    style={{
                      cursor: 'pointer',
                      borderColor: selectedCat === cat.id ? 'var(--accent-purple)' : 'var(--color-border)',
                      background: selectedCat === cat.id ? 'rgba(108,99,255,0.08)' : 'var(--color-surface)',
                    }}
                    onClick={() => setSelectedCat(cat.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span style={{
                        fontSize: '1.8rem',
                        background: 'var(--color-bg-3)',
                        borderRadius: 'var(--radius-md)',
                        width: 52, height: 52,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{cat.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{cat.label}</div>
                        <div className="text-xs text-muted">{cat.desc}</div>
                        {minWait !== null && (
                          <div className="text-xs" style={{ color: 'var(--accent-cyan)', marginTop: 2 }}>
                            ~{minWait} min wait
                          </div>
                        )}
                      </div>
                      {selectedCat === cat.id && (
                        <span style={{ color: 'var(--accent-purple)', fontSize: '1.2rem' }}>✓</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedCat && (
              <div className="text-center mt-6">
                <button
                  id="join-queue-btn"
                  className="btn btn-primary btn-lg"
                  onClick={handleJoinQueue}
                  disabled={isJoining}
                >
                  {isJoining ? (
                    <span className="flex items-center gap-2">
                      <span className="spinner spinner-sm"></span> Getting your token...
                    </span>
                  ) : (
                    `🎫 Join ${CATEGORIES.find(c => c.id === selectedCat)?.label} Queue`
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
