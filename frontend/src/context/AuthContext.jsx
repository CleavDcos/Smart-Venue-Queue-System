/**
 * context/AuthContext.jsx - Global Authentication State
 *
 * Provides: user, token, login(), logout(), isAdmin, isLoading
 * Persists auth state to localStorage.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { requestNotificationPermission } from '../firebase/firebase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [token, setToken]     = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('queuex_token');
    const storedUser  = localStorage.getItem('queuex_user');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        // Verify token is still valid by fetching profile
        authAPI.getMe()
          .then((res) => setUser(res.data.user))
          .catch(() => { logout(); }) // Token expired — clear session
          .finally(() => setIsLoading(false));
      } catch {
        logout();
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const res  = await authAPI.login({ email, password });
    const data = res.data;

    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('queuex_token', data.token);
    localStorage.setItem('queuex_user',  JSON.stringify(data.user));

    // Request FCM push notification permission
    try {
      const fcmToken = await requestNotificationPermission();
      if (fcmToken) {
        await authAPI.updateFcmToken(fcmToken);
      }
    } catch {
      // Non-critical — don't block login
    }

    return data;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const res  = await authAPI.register({ name, email, password });
    const data = res.data;

    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('queuex_token', data.token);
    localStorage.setItem('queuex_user',  JSON.stringify(data.user));

    return data;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('queuex_token');
    localStorage.removeItem('queuex_user');
  }, []);

  const value = {
    user,
    token,
    isLoading,
    isAuthenticated: !!user,
    isAdmin:         user?.role === 'admin',
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
