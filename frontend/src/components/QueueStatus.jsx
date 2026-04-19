/**
 * components/QueueStatus.jsx
 * Displays a user's live queue position, estimated wait, and stall info.
 * Reacts to real-time Firestore updates.
 */

import { useEffect, useState } from 'react';
import { db, isFirebaseConfigured } from '../firebase/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

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

const QueueStatus = ({ token: initialToken }) => {
  const [liveToken, setLiveToken] = useState(initialToken);

  useEffect(() => {
    // If no db or no ID, do nothing and rely on polling / initial data
    if (!initialToken?._id || !db || !isFirebaseConfigured) {
      setLiveToken(initialToken);
      return;
    }

    const docRef = doc(db, 'queueTokens', initialToken._id.toString());
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const liveData = docSnap.data();
        // Merge MongoDB data as base, overwrite with real-time minimal Firestore data 
        setLiveToken((prev) => ({ ...prev, ...liveData }));
      }
    });

    return () => unsubscribe();
  }, [initialToken]);

  if (!liveToken) return null;

  const status = STATUS_CONFIG[liveToken.status] || STATUS_CONFIG.waiting;
  const stallName     = liveToken.stallId?.name     || liveToken.stallName     || 'Assigned Stall';
  const stallLocation = liveToken.stallId?.location || liveToken.stallLocation || '';
  const stallNav      = liveToken.stallId?.navigationInstructions || liveToken.navigationInstructions || '';
  const category      = liveToken.category;

  return (
    <article className="token-card animate-fade-up" aria-labelledby={`token-title-${liveToken.tokenNumber}`}>
      {/* Header row */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: '2rem' }}>{CATEGORY_ICONS[category] || '🎟️'}</span>
          <div>
            <h2 id={`token-title-${liveToken.tokenNumber}`} className="token-number m-0">{liveToken.tokenNumber}</h2>
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
      {liveToken.status === 'waiting' && (
        <div className="flex gap-4 mb-5" style={{ flexWrap: 'wrap' }}>
          <div style={{
            flex: 1, minWidth: 120,
            background: 'rgba(108,99,255,0.08)',
            border: '1px solid rgba(108,99,255,0.15)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem',
            textAlign: 'center',
          }}>
            <div className="queue-position" style={{ justifyContent: 'center', margin: 0 }} aria-live="polite" aria-atomic="true">
              <span className="position-number" style={{ fontSize: '2.5rem' }} aria-label={`Position ${liveToken.position}`}>#{liveToken.position}</span>
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
            <div className="position-number" style={{ fontSize: '2.5rem', color: 'var(--accent-cyan)' }} aria-live="polite" aria-atomic="true" aria-label={`${liveToken.estimatedWaitMinutes} minutes estimated wait`}>
              {liveToken.estimatedWaitMinutes}
            </div>
            <div className="text-xs text-muted">Est. Wait (min)</div>
          </div>
        </div>
      )}

      {liveToken.status === 'serving' && (
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
      {liveToken.reassignmentHistory?.length > 0 && (
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
    </article>
  );
};

export default QueueStatus;
