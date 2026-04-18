/**
 * components/QueueStatus.jsx
 * Displays a user's live queue position, estimated wait, and stall info.
 * Reacts to real-time Firestore updates.
 */

const CATEGORY_ICONS = {
  food: '🍔', beverage: '🥤', merchandise: '🛒', medical: '🏥', information: 'ℹ️',
};

const STATUS_CONFIG = {
  waiting:    { label: 'In Queue',  cls: 'badge-waiting',  color: 'var(--status-waiting)'  },
  serving:    { label: 'Serving Now', cls: 'badge-serving', color: 'var(--status-serving)'  },
  done:       { label: 'Complete',  cls: 'badge-done',     color: 'var(--status-done)'      },
  cancelled:  { label: 'Cancelled', cls: 'badge-cancelled',color: 'var(--status-cancelled)' },
  reassigned: { label: 'Updated',   cls: 'badge-waiting',  color: 'var(--status-waiting)'   },
};

const QueueStatus = ({ token }) => {
  if (!token) return null;

  const status = STATUS_CONFIG[token.status] || STATUS_CONFIG.waiting;
  const stallName     = token.stallId?.name     || token.stallName     || 'Assigned Stall';
  const stallLocation = token.stallId?.location || token.stallLocation || '';
  const stallNav      = token.stallId?.navigationInstructions || token.navigationInstructions || '';
  const category      = token.category;

  return (
    <div className="token-card animate-fade-up">
      {/* Header row */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: '2rem' }}>{CATEGORY_ICONS[category] || '🎟️'}</span>
          <div>
            <div className="token-number">{token.tokenNumber}</div>
            <div className="text-xs text-muted" style={{ marginTop: 2 }}>Queue Token</div>
          </div>
        </div>
        <div>
          <span className={`badge ${status.cls}`}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.color, display: 'inline-block' }}></span>
            {status.label}
          </span>
        </div>
      </div>

      {/* Position & Wait */}
      {token.status === 'waiting' && (
        <div className="flex gap-4 mb-5" style={{ flexWrap: 'wrap' }}>
          <div style={{
            flex: 1, minWidth: 120,
            background: 'rgba(108,99,255,0.08)',
            border: '1px solid rgba(108,99,255,0.15)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem',
            textAlign: 'center',
          }}>
            <div className="queue-position" style={{ justifyContent: 'center', margin: 0 }}>
              <span className="position-number" style={{ fontSize: '2.5rem' }}>#{token.position}</span>
            </div>
            <div className="text-xs text-muted">Position in Queue</div>
          </div>

          <div style={{
            flex: 1, minWidth: 120,
            background: 'rgba(72,209,204,0.08)',
            border: '1px solid rgba(72,209,204,0.15)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem',
            textAlign: 'center',
          }}>
            <div className="position-number" style={{ fontSize: '2.5rem', color: 'var(--accent-cyan)' }}>
              {token.estimatedWaitMinutes}
            </div>
            <div className="text-xs text-muted">Est. Wait (min)</div>
          </div>
        </div>
      )}

      {token.status === 'serving' && (
        <div style={{
          background: 'rgba(16,185,129,0.1)',
          border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem',
          textAlign: 'center',
          marginBottom: '1.25rem',
        }} className="animate-pulse-glow">
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔔</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--status-serving)' }}>
            It's Your Turn!
          </div>
          <div className="text-sm text-secondary" style={{ marginTop: 4 }}>
            Please proceed to the stall immediately
          </div>
        </div>
      )}

      {/* Stall Info */}
      <div style={{
        background: 'var(--color-bg-3)',
        borderRadius: 'var(--radius-md)',
        padding: '1rem',
      }}>
        <div className="flex items-center gap-2 mb-2">
          <span style={{ fontSize: '1.1rem' }}>📍</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{stallName}</div>
            {stallLocation && (
              <div className="text-xs text-muted">{stallLocation}</div>
            )}
          </div>
        </div>

        {stallNav && (
          <div style={{
            marginTop: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--color-border)',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'flex-start',
          }}>
            <span>🗺️</span>
            <span>{stallNav}</span>
          </div>
        )}
      </div>

      {/* Reassignment Notice */}
      {token.reassignmentHistory?.length > 0 && (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.75rem',
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.8rem',
          color: 'var(--status-waiting)',
          display: 'flex', gap: '0.5rem',
        }}>
          <span>🔄</span>
          <span>You were reassigned to a less crowded stall for a shorter wait.</span>
        </div>
      )}
    </div>
  );
};

export default QueueStatus;
