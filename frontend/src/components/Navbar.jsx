/**
 * components/Navbar.jsx - Application Navigation Bar
 */

import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Brand */}
        <Link to="/" className="navbar-brand">
          <div className="navbar-logo">⚡</div>
          <span className="navbar-name">QueueX</span>
        </Link>

        {/* Desktop Links */}
        <div className="navbar-links">
          <NavLink to="/" className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`} end>
            Events
          </NavLink>
          {isAuthenticated && (
            <NavLink to="/queue" className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}>
              My Queue
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `navbar-link ${isActive ? 'active' : ''}`}>
              Dashboard
            </NavLink>
          )}
        </div>

        {/* Actions */}
        <div className="navbar-actions">
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div style={{
                  width: 32, height: 32,
                  background: 'var(--grad-primary)',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.85rem', fontWeight: 700,
                }}>
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {user?.name?.split(' ')[0]}
                </span>
                {isAdmin && (
                  <span className="badge badge-active" style={{ fontSize: '0.65rem' }}>Admin</span>
                )}
              </div>
              <button id="navbar-logout-btn" className="btn btn-secondary btn-sm" onClick={handleLogout}>
                Logout
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Link to="/login" className="btn btn-secondary btn-sm">Log In</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Sign Up</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
