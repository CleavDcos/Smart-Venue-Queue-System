/**
 * components/StallCard.jsx
 * Compact stall information card used in stall listings and join queue flow.
 */

const CATEGORY_CONFIG = {
  food:        { icon: '🍔', label: 'Food',        color: '#f59e0b' },
  beverage:    { icon: '🥤', label: 'Beverage',    color: '#4cc9f0' },
  merchandise: { icon: '🛒', label: 'Merchandise', color: '#a78bfa' },
  medical:     { icon: '🏥', label: 'Medical',     color: '#f87171' },
  information: { icon: 'ℹ️', label: 'Information', color: '#34d399' },
};

const getHeatColor = (ratio) => {
  if (ratio >= 0.8) return '#ef4444';
  if (ratio >= 0.5) return '#f59e0b';
  return '#10b981';
};

const getHeatLabel = (ratio) => {
  if (ratio >= 0.8) return 'Very Busy';
  if (ratio >= 0.5) return 'Moderate';
  return 'Available';
};

const StallCard = ({ stall, onSelect, selected, showJoinBtn }) => {
  const cat     = CATEGORY_CONFIG[stall.category] || { icon: '🏪', label: stall.category, color: '#6c63ff' };
  const ratio   = stall.loadRatio ?? (stall.capacity > 0 ? stall.currentLoad / stall.capacity : 0);
  const heat    = getHeatColor(ratio);
  const heatLbl = getHeatLabel(ratio);
  const waitMin = stall.estimatedWaitMinutes ?? Math.ceil(stall.currentLoad * stall.avgServiceTime * 1.1);

  return (
    <div
      className={`card card-hover ${selected ? 'animate-pulse-glow' : ''}`}
      style={{
        cursor: onSelect ? 'pointer' : 'default',
        borderColor: selected ? 'var(--accent-purple)' : 'var(--color-border)',
        transition: 'all 0.25s ease',
      }}
      onClick={() => onSelect?.(stall)}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <span style={{
            fontSize: '1.4rem',
            background: 'var(--color-bg-3)',
            borderRadius: 'var(--radius-sm)',
            width: 38, height: 38,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {cat.icon}
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{stall.name}</div>
            <div className="text-xs text-muted">{cat.label}</div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: stall.isOpen ? '#10b981' : '#6b7280',
            boxShadow: stall.isOpen ? '0 0 6px #10b981' : 'none',
          }}></span>
          <span className="text-xs text-muted">{stall.isOpen ? 'Open' : 'Closed'}</span>
        </div>
      </div>

      {/* Location */}
      <div className="flex items-center gap-1 mb-3" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <span>📍</span> {stall.location}
      </div>

      {/* Load Bar */}
      <div className="heatmap-bar-track">
        <div
          className="heatmap-bar-fill"
          style={{
            width: `${Math.min(ratio * 100, 100)}%`,
            background: `${heat}`,
            boxShadow: `0 0 8px ${heat}60`,
          }}
        />
      </div>

      {/* Stats Row */}
      <div className="flex justify-between items-center mt-3">
        <div className="flex gap-3">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{stall.currentLoad}</div>
            <div className="text-xs text-muted">In Queue</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
              ~{waitMin}m
            </div>
            <div className="text-xs text-muted">Wait</div>
          </div>
        </div>
        <span style={{
          fontSize: '0.7rem', fontWeight: 600,
          padding: '0.2rem 0.5rem',
          borderRadius: 'var(--radius-full)',
          background: `${heat}20`,
          color: heat,
          border: `1px solid ${heat}40`,
        }}>
          {heatLbl}
        </span>
      </div>

      {/* Join Button (optional) */}
      {showJoinBtn && stall.isOpen && (
        <button
          id={`join-stall-${stall._id}`}
          className="btn btn-primary btn-sm btn-block mt-4"
          onClick={(e) => { e.stopPropagation(); onSelect?.(stall); }}
        >
          Join Queue →
        </button>
      )}
    </div>
  );
};

export default StallCard;
