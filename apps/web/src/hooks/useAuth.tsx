import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setAuthToken, clearAuthToken } from '@/lib/api';
import type { User, Preferences } from '@/types';

interface AuthState {
  user: User | null;
  preferences: Preferences | null;
  workspaceId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, inviteCode?: string) => Promise<void>;
  logout: () => void;
  updatePreferences: (prefs: Partial<Preferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    preferences: null,
    workspaceId: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      const wsId = localStorage.getItem('agentdesk_workspace');
      setState({
        user: data.user,
        preferences: data.preferences,
        workspaceId: wsId,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch {
      setState((s) => ({ ...s, isLoading: false, isAuthenticated: false }));
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('agentdesk_token');
    if (token) {
      fetchMe();
    } else {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAuthToken(data.token);
    localStorage.setItem('agentdesk_workspace', data.workspace.id);
    setState({
      user: data.user,
      preferences: null,
      workspaceId: data.workspace.id,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, inviteCode?: string) => {
    const { data } = await api.post('/auth/register', { name, email, password, invite_code: inviteCode || undefined });
    setAuthToken(data.token);
    localStorage.setItem('agentdesk_workspace', data.workspace.id);
    setState({
      user: data.user,
      preferences: null,
      workspaceId: data.workspace.id,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    localStorage.removeItem('agentdesk_workspace');
    setState({ user: null, preferences: null, workspaceId: null, isLoading: false, isAuthenticated: false });
  }, []);

  const updatePreferences = useCallback(async (prefs: Partial<Preferences>) => {
    const { data } = await api.patch('/settings/preferences', prefs);
    setState((s) => ({ ...s, preferences: data.data }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, updatePreferences }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
