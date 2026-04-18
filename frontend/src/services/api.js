/**
 * services/api.js - Axios API Layer
 *
 * Centralized HTTP client with:
 *   - Automatic JWT injection from localStorage
 *   - Consistent error handling
 *   - Request/response interceptors
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request Interceptor: Inject JWT ──────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('queuex_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor: Handle Global Errors ───────────────────────────────
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error.response?.data?.message ||
      error.message ||
      'Something went wrong. Please try again.';

    // Auto-logout on 401 (expired/invalid token)
    if (error.response?.status === 401) {
      localStorage.removeItem('queuex_token');
      localStorage.removeItem('queuex_user');
      // Redirect to login if not already there
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(new Error(message));
  }
);

// ─── Auth Endpoints ───────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login:    (data) => api.post('/auth/login', data),
  getMe:    ()     => api.get('/auth/me'),
  updateFcmToken: (fcmToken) => api.put('/auth/fcm-token', { fcmToken }),
};

// ─── Queue Endpoints ──────────────────────────────────────────────────────────
export const queueAPI = {
  joinQueue:       (data)    => api.post('/queue/join', data),
  getMyToken:      ()        => api.get('/queue/my-token'),
  getMyHistory:    ()        => api.get('/queue/history'),
  cancelToken:     ()        => api.post('/queue/cancel'),
  callNextUser:    (stallId) => api.post(`/queue/call-next/${stallId}`),
  completeService: (tokenId) => api.post(`/queue/complete/${tokenId}`),
  getStallQueue:   (stallId) => api.get(`/queue/stall/${stallId}`),
};

// ─── Event Endpoints ──────────────────────────────────────────────────────────
export const eventAPI = {
  list:         (params) => api.get('/events', { params }),
  get:          (id)     => api.get(`/events/${id}`),
  create:       (data)   => api.post('/events', data),
  updateStatus: (id, status) => api.put(`/events/${id}/status`, { status }),
  delete:       (id)     => api.delete(`/events/${id}`),
};

// ─── Stall Endpoints ──────────────────────────────────────────────────────────
export const stallAPI = {
  listByEvent: (eventId) => api.get(`/stalls/event/${eventId}`),
  get:         (id)      => api.get(`/stalls/${id}`),
  create:      (data)    => api.post('/stalls', data),
  update:      (id, data)=> api.put(`/stalls/${id}`, data),
  toggle:      (id)      => api.put(`/stalls/${id}/toggle`),
  delete:      (id)      => api.delete(`/stalls/${id}`),
};

// ─── Admin Endpoints ──────────────────────────────────────────────────────────
export const adminAPI = {
  getDashboard: (eventId) => api.get(`/admin/dashboard/${eventId}`),
  getAnalytics: (eventId) => api.get(`/admin/analytics/${eventId}`),
  rebalance:    (eventId) => api.post(`/admin/rebalance/${eventId}`),
  broadcast:    (eventId, data) => api.post(`/admin/broadcast/${eventId}`, data),
  getUsers:     (params) => api.get('/admin/users', { params }),
};

export default api;
