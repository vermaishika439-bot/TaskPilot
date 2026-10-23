import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import EmptyState from '../components/EmptyState.jsx';

export default function NotFound() {
  return (
    <div className="page">
      <EmptyState
        icon={<Compass size={24} />}
        title="Page not found"
        actions={
          <Link to="/" className="btn btn-primary">
            Back to Overview
          </Link>
        }
      >
        That page doesn’t exist.
      </EmptyState>
    </div>
  );
}
