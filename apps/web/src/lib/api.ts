import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('agentdesk_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('agentdesk_token');
      localStorage.removeItem('agentdesk_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export function setAuthToken(token: string) {
  localStorage.setItem('agentdesk_token', token);
}

export function clearAuthToken() {
  localStorage.removeItem('agentdesk_token');
  localStorage.removeItem('agentdesk_user');
}

export function getAuthToken(): string | null {
  return localStorage.getItem('agentdesk_token');
}
