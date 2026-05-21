import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EnrollmentPage from './pages/EnrollmentPage';
import PaymentPage from './pages/PaymentPage';
import StudentsPage from './pages/StudentsPage';
import TutorsPage from './pages/TutorsPage';
import SubjectsPage from './pages/SubjectsPage';
import GradesPage from './pages/GradesPage';
import AttendancePage from './pages/AttendancePage';
import ParentModulePage from './pages/ParentModulePage';
import EnlistmentPage from './pages/EnlistmentPage';
import { useAuthStore } from './store/authStore';

function Protected({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><Layout /></Protected>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="enrollment" element={<EnrollmentPage />} />
        <Route path="payment" element={<PaymentPage />} />
        <Route path="records/students" element={<StudentsPage />} />
        <Route path="records/parents" element={<ParentModulePage />} />
        <Route path="records/tutors" element={<TutorsPage />} />
        <Route path="records/subjects" element={<SubjectsPage />} />
        <Route path="records/grades" element={<GradesPage />} />
        <Route path="records/attendance" element={<AttendancePage />} />
        <Route path="enlistment" element={<EnlistmentPage />} />
      </Route>
    </Routes>
  );
}
