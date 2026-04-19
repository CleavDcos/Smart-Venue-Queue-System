/**
 * pages/QueuePage.jsx - Live Queue Status Page for Users
 *
 * Shows the user's active queue token with real-time Firestore updates.
 * Displays: token number, position, estimated wait, navigation, and QR code.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useActiveToken } from '../hooks/useQueue';
import { queueAPI } from '../services/api';
import QueueStatus from '../components/QueueStatus';
import { trackQueueCancel, trackEvent } from '../services/analytics';

const QueuePage = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const toast    = useToast();
  const { token, isLoading, setToken } = useActiveToken();
  const [isCancelling, setIsCancelling] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate('/login');
  }, [isAuthenticated]);

  const handleCancel = async () => {
    if (!window.confirm('Cancel your queue token? You will lose your position.')) return;
    setIsCancelling(true);
    try {
      await queueAPI.cancelToken();
      trackQueueCancel(); // GA4 event
      setToken(null);
      toast.success('Token cancelled. You can join a new queue anytime.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsCancelling(false);
    }
  };

  // Track when user views their active queue status
  useEffect(() => {
    if (token?.status === 'waiting' || token?.status === 'serving') {
      trackEvent('queue_status_view', { event_category: 'Queue', status: token.status });
    }
  }, [token?._id]);

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await queueAPI.getMyHistory();
      setHistory(res.data.tokens);
      setShowHistory(true);
    } catch {
      toast.error('Failed to load history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  if (isLoading) {
    return (
      <div className="page-content">
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p className="text-muted">Loading your queue status...</p>
        </div>
      </div>
    );
  }

  const STATUS_BADGE_MAP = {
    waiting: 'badge-waiting', serving: 'badge-serving',
    done: 'badge-done', cancelled: 'badge-cancelled',
  };

  return (
    <div className="page-content">
      <div className="container-sm py-8">
        <div className="section-header">
          <h1 style={{ fontSize: '1.75rem' }}>🎟️ My Queue</h1>
          <button
            id="show-history-btn"
            className="btn btn-secondary btn-sm"
            onClick={fetchHistory}
            disabled={isLoadingHistory}
          >
            {isLoadingHistory ? '...' : 'History'}
          </button>
        </div>

        {/* Active Token */}
        {token && (token.status === 'waiting' || token.status === 'serving') ? (
          <div className="animate-fade-up">
            <QueueStatus token={token} />

            {/* Live indicator */}
            <div className="flex items-center gap-2 justify-center mt-4 mb-4">
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: '#10b981',
                boxShadow: '0 0 6px #10b981',
                animation: 'pulse-glow 2s ease infinite',
              }}></span>
              <span className="text-xs text-muted">Live updates enabled</span>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              {token.status === 'waiting' && (
                <button
                  id="cancel-token-btn"
                  className="btn btn-danger btn-sm"
                  onClick={handleCancel}
                  disabled={isCancelling}
                  style={{ flex: 1 }}
                >
                  {isCancelling ? 'Cancelling...' : '✕ Leave Queue'}
                </button>
              )}
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/')}
                style={{ flex: 1 }}
              >
                ← Back to Events
              </button>
            </div>

            {/* Tips */}
            <div className="card-glass mt-5" style={{ fontSize: '0.85rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                💡 Tips
              </div>
              <ul style={{ paddingLeft: '1.1rem', color: 'var(--text-secondary)', lineHeight: 2 }}>
                <li>Keep your phone nearby for notifications</li>
                <li>Head to the stall 2 minutes before your turn</li>
                <li>Show your QR code when you arrive at the stall</li>
                <li>You may be moved to a less crowded stall — check notifications</li>
              </ul>
            </div>
          </div>

        ) : (
          /* No active token */
          <div className="empty-state animate-fade-up">
            <div className="empty-state-icon animate-float">🎫</div>
            <h2 style={{ marginBottom: '0.5rem' }}>No Active Token</h2>
            <p className="text-secondary mb-6">
              {token?.status === 'done'
                ? "Your service is complete! Thanks for using QueueX."
                : "You haven't joined a queue yet. Pick an event to get started."}
            </p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Browse Events →
            </button>
          </div>
        )}

        {/* History Panel */}
        {showHistory && (
          <div className="mt-8 animate-fade-up">
            <div className="section-header">
              <h3 style={{ fontSize: '1.1rem' }}>Queue History</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowHistory(false)}>Close</button>
            </div>

            {history.length === 0 ? (
              <p className="text-muted text-center py-4">No history yet</p>
            ) : (
              <div className="flex flex-col gap-3">
                {history.map((t) => (
                  <div key={t._id} className="card" style={{ padding: '1rem' }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{t.tokenNumber}</div>
                        <div className="text-xs text-muted">
                          {t.stallId?.name} · {t.eventId?.name}
                        </div>
                        <div className="text-xs text-muted">
                          {new Date(t.joinedAt).toLocaleString('en-IN', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <span className={`badge ${STATUS_BADGE_MAP[t.status] || 'badge-cancelled'}`}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default QueuePage;
