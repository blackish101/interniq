import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Shell from './Shell.jsx';
import { Loading } from './components.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Internships from './pages/Internships.jsx';
import InternshipDetail from './pages/InternshipDetail.jsx';
import Applications from './pages/Applications.jsx';
import Profile from './pages/Profile.jsx';
import People from './pages/People.jsx';
import PersonProfile from './pages/PersonProfile.jsx';
import Messages from './pages/Messages.jsx';
import Employer from './pages/Employer.jsx';
import Admin from './pages/Admin.jsx';

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading text="Restoring your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Home />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user && !loading ? <Navigate to="/" replace /> : <Login />} />

      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/internships" element={<Protected><Internships /></Protected>} />
      <Route path="/internships/:id" element={<Protected><InternshipDetail /></Protected>} />

      <Route path="/applications" element={<Protected roles={['student']}><Applications /></Protected>} />
      <Route path="/me" element={<Protected roles={['student']}><Profile /></Protected>} />

      <Route path="/people" element={<Protected><People /></Protected>} />
      <Route path="/network" element={<Protected><People defaultRequests /></Protected>} />
      <Route path="/people/:id" element={<Protected><PersonProfile /></Protected>} />
      <Route path="/messages" element={<Protected><Messages /></Protected>} />

      <Route path="/employer/:tab" element={<Protected roles={['employer', 'admin']}><Employer /></Protected>} />
      <Route path="/employer" element={<Protected roles={['employer', 'admin']}><Navigate to="/employer/postings" replace /></Protected>} />
      <Route path="/admin" element={<Protected roles={['admin']}><Admin /></Protected>} />
      <Route path="/admin/:tab" element={<Protected roles={['admin']}><Admin /></Protected>} />

      <Route path="*" element={<Protected><Home /></Protected>} />
    </Routes>
  );
}
