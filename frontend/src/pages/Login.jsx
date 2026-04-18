/**
 * pages/Login.jsx - Authentication Page (Login + Register)
 */

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const Login = ({ mode = 'login' }) => {
  const [isLogin, setIsLogin]   = useState(mode === 'login');
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const { login, register } = useAuth();
  const toast    = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from     = location.state?.from?.pathname || '/';

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
        await login(form.email, form.password);
        toast.success('Welcome back!');
      } else {
        if (!form.name.trim()) { toast.error('Name is required'); setIsLoading(false); return; }
        await register(form.name, form.email, form.password);
        toast.success('Account created! Welcome to QueueX 🎉');
      }
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-up">
        {/* Logo */}
        <div className="text-center mb-6">
          <div style={{
            width: 60, height: 60,
            background: 'var(--grad-primary)',
            borderRadius: 'var(--radius-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem',
            margin: '0 auto 1rem',
            boxShadow: 'var(--shadow-glow)',
          }}>⚡</div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h1>
          <p className="text-secondary text-sm">
            {isLogin
              ? 'Sign in to access your virtual queue'
              : 'Join the smarter way to queue at events'}
          </p>
        </div>

        <form onSubmit={handleSubmit} id="auth-form">
          {!isLogin && (
            <div className="form-group">
              <label className="form-label" htmlFor="name">Full Name</label>
              <input
                id="name"
                name="name"
                type="text"
                className="form-input"
                placeholder="Rahul Sharma"
                value={form.name}
                onChange={handleChange}
                required={!isLogin}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email Address</label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className="form-input"
              placeholder={isLogin ? "••••••••" : "Min. 6 characters"}
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
            />
          </div>

          <button
            id="auth-submit-btn"
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={isLoading}
            style={{ marginTop: '0.5rem' }}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="spinner spinner-sm"></span>
                {isLogin ? 'Signing in...' : 'Creating account...'}
              </span>
            ) : (
              isLogin ? 'Sign in →' : 'Create Account →'
            )}
          </button>
        </form>

        <div className="divider" />

        <p className="text-center text-sm text-secondary">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button
            id="auth-toggle-btn"
            onClick={() => setIsLogin(!isLogin)}
            style={{
              background: 'none', border: 'none',
              color: 'var(--accent-purple)', fontWeight: 600,
              cursor: 'pointer', fontSize: '0.875rem',
            }}
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        {/* Demo credentials hint */}
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          background: 'rgba(108,99,255,0.06)',
          border: '1px solid rgba(108,99,255,0.15)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
        }}>
          <strong style={{ color: 'var(--accent-purple)' }}>Demo:</strong>{' '}
          admin@venue.com / Admin@123 (Admin)
        </div>
      </div>
    </div>
  );
};

export default Login;
