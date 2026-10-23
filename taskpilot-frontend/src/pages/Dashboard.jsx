import { Link } from 'react-router-dom';
import { CheckCheck, FileText, FolderKanban, ListChecks, Rocket, Sparkles, Target, Zap } from 'lucide-react';
import Header from '../components/Header.jsx';
import StatCard from '../components/StatCard.jsx';
import PlanCard from '../components/PlanCard.jsx';
import { ProgressRing } from '../components/ProgressBar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import LoadingState from '../components/LoadingState.jsx';
import UpcomingSchedule from '../components/UpcomingSchedule.jsx';
import PlanCarousel from '../components/PlanCarousel.jsx';
import { useApp } from '../state/AppState.jsx';
import { useProfile } from '../state/Profile.jsx';
import { displayStatus, greeting, taskCounts } from '../utils/plan.js';

const STEPS = [
  { icon: Target, title: 'Describe your goal', text: 'Tell TaskPilot what you want to achieve, how many days you have and your daily hours.' },
  { icon: FileText, title: 'Review the plan', text: 'AI proposes day-by-day tasks. Nothing starts until you approve it.' },
  { icon: CheckCheck, title: 'Track real progress', text: 'Tick tasks off. If you fall behind, you get a proposal — you decide whether to apply it.' },
];

export default function Dashboard() {
  const { plans, load, backendConfigured, isPreview, refreshPlans } = useApp();
  const { firstName } = useProfile();

  const totals = plans.reduce(
    (acc, plan) => {
      const counts = taskCounts(plan);
      // Only approved plans count toward tracked progress.
      if (plan.status === 'approved') {
        acc.done += counts.done;
        acc.total += counts.total;
      }
      return acc;
    },
    { done: 0, total: 0 },
  );
  const completionRate = totals.total === 0 ? 0 : Math.round((totals.done / totals.total) * 100);
  const activePlans = plans.filter((p) => ['active', 'approved'].includes(displayStatus(p).key));
  const featured =
    plans.find((p) => displayStatus(p).key === 'active') ??
    plans.find((p) => displayStatus(p).key === 'approved') ??
    plans.find((p) => p.status === 'pending');
  const featuredHeading = featured?.status === 'pending' ? 'Waiting for your review' : 'Your active plan';
  const recent = [...plans].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 4);

  const isLoading = load.status === 'loading' || load.status === 'idle';

  return (
    <div className="page">
      <Header
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        icon={<Sparkles size={22} className="greeting-spark" aria-hidden="true" />}
        subtitle="Your goals. Our AI. A smarter way to get things done — and you stay in control."
      />

      {load.status === 'error' && (
        <ErrorMessage
          title="Couldn't load your plans"
          actions={
            <button type="button" className="btn btn-secondary btn-sm" onClick={refreshPlans}>
              Try again
            </button>
          }
        >
          {load.error}
        </ErrorMessage>
      )}

      {isLoading && backendConfigured ? (
        <LoadingState label="Loading your plans…" />
      ) : plans.length === 0 ? (
        <>
          {!backendConfigured && (
            <ErrorMessage tone="warn" title="Backend not configured">
              Plans are created and saved by the TaskPilot backend, which isn’t connected yet. You can explore the screens now;
              generating and saving plans will work once the API is configured.
            </ErrorMessage>
          )}
          <section className="hero card" aria-labelledby="hero-title">
            <div className="hero-copy">
              <span className="eyebrow">
                <Rocket size={14} aria-hidden="true" /> Welcome to TaskPilot
              </span>
              <h2 id="hero-title">Turn Goals Into Momentum.</h2>
              <p>
                Start with one goal. TaskPilot drafts a time-bound plan, you approve it, and your dashboard fills with real
                progress.
              </p>
              <div className="hero-actions">
                <Link to="/assistant?mode=create" className="btn btn-primary">
                  <Sparkles size={17} aria-hidden="true" /> Create your first plan with AI
                </Link>
              </div>
            </div>
            <ol className="steps">
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="step">
                  <span className="step-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3>
                      <Icon size={15} aria-hidden="true" /> {title}
                    </h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <UpcomingSchedule />
        </>
      ) : (
        <>
          <section className="stats" aria-label="Summary">
            <StatCard label="Total plans" value={plans.length} icon={<FolderKanban size={20} />} />
            <StatCard label="Active plans" value={activePlans.length} icon={<Zap size={20} />} tone="mint" />
            <StatCard
              label="Completed tasks"
              value={totals.done}
              suffix={`/ ${totals.total}`}
              icon={<ListChecks size={20} />}
            />
            <StatCard label="Completion rate" value={`${completionRate}%`}>
              <ProgressRing value={completionRate} size={48} stroke={5} label="Completion rate" />
            </StatCard>
          </section>

          <section className="dashboard-featured">
            {featured ? (
              <PlanCard plan={featured} heading={featuredHeading} />
            ) : (
              <EmptyState icon={<Zap size={24} />} title="No active plan">
                Approve a plan to start tracking progress here.
              </EmptyState>
            )}
          </section>

          <div className="dashboard-columns">
            <PlanCarousel plans={recent} isPreview={isPreview} />
            <UpcomingSchedule />
          </div>
        </>
      )}
    </div>
  );
}
