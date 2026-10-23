export default function StatCard({ label, value, suffix, icon, tone, children }) {
  return (
    <div className="stat">
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">
          {value}
          {suffix && <small> {suffix}</small>}
        </div>
      </div>
      {children ?? (icon && <div className={`stat-icon${tone === 'mint' ? ' mint' : ''}`} aria-hidden="true">{icon}</div>)}
    </div>
  );
}
