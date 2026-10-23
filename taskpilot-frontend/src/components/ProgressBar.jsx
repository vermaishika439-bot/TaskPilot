export default function ProgressBar({ value, label = 'Progress', showValue = true }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {showValue && <span className="progress-value">{pct}%</span>}
    </div>
  );
}

export function ProgressRing({ value, size = 56, stroke = 6, label = 'Progress' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${pct}%`}>
      <svg width={size} height={size} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span className="ring-label" style={{ fontSize: size * 0.27 }}>
        {pct}%
      </span>
    </div>
  );
}
