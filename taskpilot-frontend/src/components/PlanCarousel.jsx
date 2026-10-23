import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Clock, Target } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import PlanStatusBadge from './PlanStatusBadge.jsx';
import ProgressBar from './ProgressBar.jsx';
import { displayStatus, planPath, planTitle, progressOf, taskCounts } from '../utils/plan.js';

function dateValue(plan) {
  return plan.deadline || plan.deadlineAt || plan.dueDate || plan.endDate || null;
}

function deadlineText(plan) {
  const value = dateValue(plan);
  if (!value) return plan.availableDays ? `${plan.availableDays} days available` : null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : `Due ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export default function PlanCarousel({ plans = [], isPreview = false }) {
  const [index, setIndex] = useState(0);
  const [slideStep, setSlideStep] = useState(0);
  const [dragStart, setDragStart] = useState(null);
  const navigate = useNavigate();
  const viewportRef = useRef(null);
  const safeIndex = Math.min(index, Math.max(0, plans.length - 1));
  const current = plans[safeIndex];
  const hasPrevious = safeIndex > 0;
  const hasNext = safeIndex < plans.length - 1;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const measure = () => {
      const slide = viewport.querySelector('.plan-carousel-slide');
      if (!slide) {
        setSlideStep(0);
        return;
      }

      const track = slide.parentElement;
      const trackStyles = window.getComputedStyle(track);
      const gap = Number.parseFloat(trackStyles.columnGap || trackStyles.gap || '0') || 0;
      setSlideStep(slide.getBoundingClientRect().width + gap);
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [plans.length]);

  function move(direction) {
    setIndex((value) => Math.max(0, Math.min(plans.length - 1, value + direction)));
  }

  function openCurrent(event) {
    if (event.target.closest('a, button')) return;
    if (current) navigate(planPath(current));
  }

  function onTouchStart(event) {
    setDragStart(event.touches[0].clientX);
  }

  function onTouchEnd(event) {
    if (dragStart === null) return;
    const distance = event.changedTouches[0].clientX - dragStart;
    if (Math.abs(distance) > 42) move(distance < 0 ? 1 : -1);
    setDragStart(null);
  }

  if (plans.length === 0) return null;

  return (
    <section className="card plans-carousel-card" aria-labelledby="recent-title">
      <div className="card-head">
        <div>
          <h2 className="card-title" id="recent-title">Recent plans</h2>
          {isPreview && <p className="field-hint">Sample plans for preview</p>}
        </div>
        <div className="carousel-heading-actions">
          <span className="carousel-count" aria-live="polite">{safeIndex + 1} of {plans.length}</span>
          <Link to="/plans" className="link-more">View all <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="plans-carousel-viewport"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-roledescription="carousel"
        aria-label="Recent plans"
      >
        <div
          className="plans-carousel-track"
          style={{ transform: `translate3d(-${safeIndex * slideStep}px, 0, 0)` }}
        >
          {plans.map((plan) => {
            const { done, total } = taskCounts(plan);
            const status = displayStatus(plan);
            const progress = progressOf(plan);
            const deadline = deadlineText(plan);
            return (
              <article
                className="plan-carousel-slide"
                key={plan.id}
                role="group"
                aria-roledescription="slide"
                aria-label={planTitle(plan)}
                tabIndex={0}
                onClick={openCurrent}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(planPath(plan));
                  }
                }}
              >
                <div className="plan-carousel-topline">
                  <span className="plan-icon" aria-hidden="true"><Target size={17} /></span>
                  <PlanStatusBadge plan={plan} />
                </div>
                <h3>{planTitle(plan)}</h3>
                <div className="plan-carousel-meta">
                  <span><CalendarDays size={14} aria-hidden="true" /> {deadline || 'No deadline set'}</span>
                  {plan.hoursPerDay != null && <span><Clock size={14} aria-hidden="true" /> {plan.hasVariedAvailability ? `${plan.totalAvailableHours} hrs total` : `${plan.hoursPerDay} hrs/day`}</span>}
                </div>
                {status.key !== 'pending' && status.key !== 'rejected' ? (
                  <div className="plan-carousel-progress">
                    <ProgressBar value={progress} label={`${planTitle(plan)} progress`} />
                    <span>{progress}%</span>
                  </div>
                ) : (
                  <p className="plan-carousel-status-note">{status.key === 'pending' ? 'Review this draft to start tracking progress.' : 'This plan is not being tracked.'}</p>
                )}
                <div className="plan-carousel-foot">
                  <span className="plan-carousel-tasks"><strong>{done}</strong> of {total} tasks completed</span>
                  <Link to={planPath(plan)} className="btn btn-primary btn-sm" onClick={(event) => event.stopPropagation()}>
                    {status.key === 'pending' ? 'Review' : 'Open Plan'} <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {plans.length > 1 && (
        <div className="plans-carousel-controls" aria-label="Recent plan navigation">
          <button type="button" className="icon-btn" onClick={() => move(-1)} disabled={!hasPrevious} aria-label="Previous plan">
            <ArrowLeft size={17} aria-hidden="true" />
          </button>
          <div className="carousel-dots" aria-hidden="true">
            {plans.map((plan, position) => <span key={plan.id} className={position === safeIndex ? 'active' : ''} />)}
          </div>
          <button type="button" className="icon-btn" onClick={() => move(1)} disabled={!hasNext} aria-label="Next plan">
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
