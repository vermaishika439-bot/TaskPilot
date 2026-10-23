export default function EmptyState({ icon, title, children, actions }) {
  return (
    <div className="empty">
      {icon && (
        <div className="empty-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}
