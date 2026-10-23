import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Plans from './pages/Plans.jsx';
import ReviewPlan from './pages/ReviewPlan.jsx';
import PlanDetails from './pages/PlanDetails.jsx';
import RescheduleReview from './pages/RescheduleReview.jsx';
import Activity from './pages/Activity.jsx';
import Profile from './pages/Profile.jsx';
import Assistant from './pages/Assistant.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="plans" element={<Plans />} />
        <Route path="plans/:planId" element={<PlanDetails />} />
        <Route path="plans/:planId/review" element={<ReviewPlan />} />
        <Route path="plans/:planId/reschedule" element={<RescheduleReview />} />
        <Route path="/create" element={<Navigate to="/assistant?mode=create" replace />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
