import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, AuthProvider } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/auth/LoginPage';
import AICTEDashboard from './pages/aicte/AICTEDashboard';
import InstitutionsPage from './pages/aicte/InstitutionsPage';
import DuplicateReviewPage from './pages/aicte/DuplicateReviewPage';
import AuditLogPage from './pages/aicte/AuditLogPage';
import ReportsPage from './pages/aicte/ReportsPage';
import IntakeExceptionsPage from './pages/aicte/IntakeExceptionsPage';
import UsersPage from './pages/aicte/UsersPage';
import InstitutionDashboard from './pages/institution/InstitutionDashboard';
import EnrolmentsPage from './pages/institution/EnrolmentsPage';
import CSVUploadPage from './pages/institution/CSVUploadPage';
import SubmissionsPage from './pages/shared/SubmissionsPage';
import ProgrammesPage from './pages/shared/ProgrammesPage';
import ApiDocsPage from './pages/shared/ApiDocsPage';
import CorrectionRequestsPage from './pages/aicte/CorrectionRequestsPage';
import CorrectionInboxPage from './pages/institution/CorrectionInboxPage';
import Spinner from './components/ui/Spinner';

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: 'aicte_admin' | 'institution_admin' }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size={40} />
    </div>
  );
  if (!user) return <Navigate to='/login' replace />;
  if (requiredRole && user.profile.role !== requiredRole) {
    return <Navigate to={user.profile.role === 'aicte_admin' ? '/aicte' : '/institution'} replace />;
  }
  return <>{children}</>;
}

function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner size={40} /></div>;
  if (!user) return <Navigate to='/login' replace />;
  return <Navigate to={user.profile.role === 'aicte_admin' ? '/aicte' : '/institution'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path='/login' element={<LoginPage />} />
      <Route path='/' element={<RoleRedirect />} />

      {/* AICTE Routes */}
      <Route path='/aicte' element={<ProtectedRoute requiredRole='aicte_admin'><AppLayout><AICTEDashboard /></AppLayout></ProtectedRoute>} />
      <Route path='/aicte/institutions' element={<ProtectedRoute requiredRole='aicte_admin'><AppLayout><InstitutionsPage /></AppLayout></ProtectedRoute>} />
      <Route path='/aicte/programmes' element={<ProtectedRoute requiredRole='aicte_admin'><AppLayout><ProgrammesPage role='aicte' /></AppLayout></ProtectedRoute>} />
      <Route path='/aicte/submissions' element={<ProtectedRoute requiredRole='aicte_admin'><AppLayout><SubmissionsPage role='aicte' /></AppLayout></ProtectedRoute>} />
      <Route path='/aicte/duplicates' element={<ProtectedRoute requiredRole='aicte_admin'><AppLayout><DuplicateReviewPage /></AppLayout></ProtectedRoute>} />
      <Route path='/aicte/exceptions' element={<ProtectedRoute requiredRole='aicte_admin'><AppLayout><IntakeExceptionsPage /></AppLayout></ProtectedRoute>} />
      <Route path='/aicte/corrections' element={<ProtectedRoute requiredRole='aicte_admin'><AppLayout><CorrectionRequestsPage /></AppLayout></ProtectedRoute>} />
      <Route path='/aicte/reports' element={<ProtectedRoute requiredRole='aicte_admin'><AppLayout><ReportsPage /></AppLayout></ProtectedRoute>} />
      <Route path='/aicte/users' element={<ProtectedRoute requiredRole='aicte_admin'><AppLayout><UsersPage /></AppLayout></ProtectedRoute>} />
      <Route path='/aicte/audit' element={<ProtectedRoute requiredRole='aicte_admin'><AppLayout><AuditLogPage /></AppLayout></ProtectedRoute>} />
      <Route path='/aicte/api-docs' element={<ProtectedRoute requiredRole='aicte_admin'><AppLayout><ApiDocsPage /></AppLayout></ProtectedRoute>} />

      {/* Institution Routes */}
      <Route path='/institution' element={<ProtectedRoute requiredRole='institution_admin'><AppLayout><InstitutionDashboard /></AppLayout></ProtectedRoute>} />
      <Route path='/institution/enrolments' element={<ProtectedRoute requiredRole='institution_admin'><AppLayout><EnrolmentsPage /></AppLayout></ProtectedRoute>} />
      <Route path='/institution/upload' element={<ProtectedRoute requiredRole='institution_admin'><AppLayout><CSVUploadPage /></AppLayout></ProtectedRoute>} />
      <Route path='/institution/submissions' element={<ProtectedRoute requiredRole='institution_admin'><AppLayout><SubmissionsPage role='institution' /></AppLayout></ProtectedRoute>} />
      <Route path='/institution/corrections' element={<ProtectedRoute requiredRole='institution_admin'><AppLayout><CorrectionInboxPage /></AppLayout></ProtectedRoute>} />
      <Route path='/institution/programmes' element={<ProtectedRoute requiredRole='institution_admin'><AppLayout><ProgrammesPage role='institution' /></AppLayout></ProtectedRoute>} />
      <Route path='/institution/api-docs' element={<ProtectedRoute requiredRole='institution_admin'><AppLayout><ApiDocsPage /></AppLayout></ProtectedRoute>} />

      <Route path='*' element={<RoleRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}