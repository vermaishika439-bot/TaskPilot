import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/** Page title block: optional back link, title, contextual subtitle, and an actions slot. */
export default function Header({ title, subtitle, back, icon, actions }) {
  return (
    <div>
      {back && (
        <Link to={back.to} className="back-link">
          <ArrowLeft size={15} aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className="page-header">
        <div>
          <h1>
            {title}
            {icon}
          </h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </div>
  );
}
