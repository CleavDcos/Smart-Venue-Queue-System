/**
 * App.jsx - Root Application Component
 * Sets up routing, context providers, and protected route guards.
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import QueuePage from './pages/QueuePage';
import AdminDashboard from './pages/AdminDashboard';
import { trackPageView } from './services/analytics';

// ─── Route Guards ──────────────────────────────────────────────────────────────

/** Redirect to login if not authenticated */
const PrivateRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return (
    <div className="loading-overlay" style={{ minHeight: '100vh' }}>
      <div className="spinner"></div>
    </div>
  );
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

/** Redirect to home if not admin */
const AdminRoute = ({ children }) => {
  const { isAdmin, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
};

// ─── GA4 Route Tracker ────────────────────────────────────────────────────────
const RouteTracker = () => {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname, document.title);
  }, [location.pathname]);
  return null;
};

// ─── App Layout with Navbar ───────────────────────────────────────────────────
const AppLayout = () => (
  <div className="app-layout">
    <RouteTracker />
    <Navbar />
    <main className="page-content">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login"    element={<Login mode="login"    />} />
        <Route path="/register" element={<Login mode="register" />} />
        <Route path="/join/:eventId" element={<Home />} />

        <Route path="/queue" element={
          <PrivateRoute><QueuePage /></PrivateRoute>
        } />

        <Route path="/admin" element={
          <AdminRoute><AdminDashboard /></AdminRoute>
        } />

        {/* 404 */}
        <Route path="*" element={
          <div className="loading-overlay" style={{ minHeight: 'calc(100vh - 72px)', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontSize: '4rem' }}>🚫</div>
            <h2>Page Not Found</h2>
            <a href="/" className="btn btn-primary">Go Home</a>
          </div>
        } />
      </Routes>
    </main>
  </div>
);

// ─── Root App ─────────────────────────────────────────────────────────────────
const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <ToastProvider>
        <AppLayout />
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
