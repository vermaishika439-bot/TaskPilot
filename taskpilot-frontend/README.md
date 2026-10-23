# TaskPilot — Frontend

AI-powered, **human-controlled** task planning. React + Vite + plain CSS. The Flask backend (separate project) holds the database and the Gemini key; no keys live in this repo.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

Optional environment (copy `.env.example` to `.env`):

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Flask API base URL, e.g. `http://127.0.0.1:5000`. Empty = "Backend not configured". |
| `VITE_API_HEALTH_PATH` | Health route (default `/api/health`). "Backend connected" means that route answered; it does not prove the Gemini key works. |

## Backend integration

The frontend talks to the Flask backend (`run.py`) through `src/services/api.js` only. The route mapping is documented at the top of that file.

- **Assistant** (`/assistant`): sends messages to `POST /api/conversations/<id>/messages`; Gemini runs on the backend, so the API key never reaches the browser. The conversation id is kept in `localStorage` (`taskpilot.conversationId`) and the saved history and proposed actions are restored on reload. "New conversation" starts a fresh one.
- **Proposed actions** are shown on the assistant message and only run after **Approve** (`POST .../actions/<id>/confirm` with `decision: confirm`). **Reject** sends `decision: reject` and runs nothing.
- **Plans, approval, tasks, rescheduling** use the real plan routes. The list route returns summaries without tasks, so each plan is fetched in full.
- **Upcoming schedule** shows the backend's saved *reminders* (`GET /api/reminders/upcoming`). There are no Google Calendar endpoints, so no calendar events are shown or created.
- Errors are shown as the backend reports them. There is no scripted fallback reply.

Limitations that come from the backend contract:

- Plans have no title or summary (the goal is used) and tasks have no completion time (`completedAt` is omitted).
- There is no route listing a plan's reschedule proposals, so a pending proposal's id is remembered in `localStorage` and re-fetched. The reschedule request derives `remaining_days` from the plan's `days_available` minus whole days since it was created.
- Proposed actions do not store the assistant's one-line explanation; it is shown only in the session where it was proposed (the saved reply text still explains the proposal).

In `npm run dev` only, the sidebar has **Preview sample data (dev)**. It loads made-up plans (see `src/dev/sampleData.js`) behind a visible banner. Preview data is read-only, never persisted, and absent from production builds.

## Routes

| Route | Screen |
| --- | --- |
| `/` | Overview |
| `/plans` | My Plans (search, status filter, sort) |
| `/create` | Create Plan |
| `/plans/:planId/review` | Review Plan (approve / reject) |
| `/plans/:planId` | Plan Details & task tracking |
| `/plans/:planId/reschedule` | Rescheduling Proposal |
| `/activity` | Pending proposals + session activity log |

Plan creation is now entered through `/assistant?mode=create`. The old `/create` URL remains as a compatibility redirect so existing bookmarks do not break; the reusable form and API boundary remain in the source for later backend integration.

The Overview includes an Upcoming Schedule section fed by the backend's reminders (see above). No calendar events or successful calendar actions are fabricated.

## Structure

```
src/
  components/   AppLayout, Sidebar, Header, StatCard, PlanCard, DayCard, TaskItem,
                PlanStatusBadge, ProgressBar, ConfirmDialog, EmptyState, ErrorMessage,
                LoadingState, Toast, ConnectionIndicator, PlanLookup, Logo
  pages/        Dashboard, CreatePlan, ReviewPlan, PlanDetails, RescheduleReview, Plans, Activity, NotFound
  services/     api.js          <- all HTTP lives here
  state/        AppState.jsx    <- plans, actions, toasts, activity, health
  utils/        plan.js         <- derived values (progress, status labels, formatting)
  dev/          sampleData.js   <- DEV-only preview data
  styles/       tokens.css, global.css, components.css, pages.css
```

## MoodMate (signature feature)

A small companion ("Pip") on the Overview and Plan Details pages that reflects *inferred* productivity patterns:
`curious · calm · happy · in_the_zone · proud · overloaded · tired · reset`.

- Logic: `src/utils/getCompanionState.js` (pure, no React). Copy: `src/utils/companionContent.js` (local templates, no AI/API).
  UI: `src/companion/` (`Mascot.jsx`, `CompanionCard.jsx`), styles in `src/styles/companion.css`.
- Tests: `npm test` (22 cases in `src/utils/getCompanionState.test.mjs`).
- Recomputed from plan data on every change; the mood is never stored. Only the minimized/hidden preference is kept (sessionStorage).
- Uses only real fields. Optional backend fields unlock more signals: `task.completedAt` (recent activity),
  `plan.rescheduleCount` (repeated changes), `plan.createdAt` (time-left workload check). Missing fields are skipped and listed under "Why this?".
- A rejected plan is never treated as failure. It only triggers `reset` when it is the newest plan and nothing else is in progress.
- "Why this?" shows the reasons and a reminder that it can't know real feelings. In `npm run dev` with sample preview, a dev-only selector forces any state for design review.

## Profile, greeting and theme

- **Profile** (`/profile`, via the user chip at the bottom of the sidebar): name (required), email and role (optional).
  Saved in this browser's `localStorage` only — no account, no sign-in, nothing sent anywhere. The Overview greets you
  ("Good morning, Priya"). A skippable welcome prompt appears on first open; "Clear my details" removes everything.
- **Theme**: Dark (default), Light or System. Quick toggle in the top bar; full choice on the Profile page. The choice is saved
  locally and applied before first paint. Colors are tokens in `src/styles/tokens.css` (`:root[data-theme='light']` overrides).
- **MoodMate** now lives at the bottom of the sidebar and reads all plans.
