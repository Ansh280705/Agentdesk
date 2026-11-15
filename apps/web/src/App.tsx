import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { ThemeProvider } from '@/hooks/useTheme';
import { AppLayout } from '@/components/layout/AppLayout';

import LoginPage from '@/pages/Login';
import RegisterPage from '@/pages/Register';
import ChatPage from '@/pages/Chat';
import ChannelsPage from '@/pages/Channels';
import AgentsPage from '@/pages/Agents';
import ArtifactsPage from '@/pages/Artifacts';
import KnowledgePage from '@/pages/Knowledge';
import TasksPage from '@/pages/Tasks';
import DataSourcesPage from '@/pages/DataSources';
import SettingsPage from '@/pages/Settings';
import SchedulesPage from '@/pages/Schedules';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading AgentDesk…</p>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/chat" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
              <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route index element={<Navigate to="/chat" replace />} />
                <Route path="/dashboard" element={<Navigate to="/chat" replace />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/chat/:id" element={<ChatPage />} />
                <Route path="/room" element={<Navigate to="/channels" replace />} />
                <Route path="/channels" element={<ChannelsPage />} />
                <Route path="/channels/:id" element={<ChannelsPage />} />
                <Route path="/agents" element={<AgentsPage />} />
                <Route path="/artifacts" element={<ArtifactsPage />} />
                <Route path="/knowledge" element={<KnowledgePage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/data-sources" element={<DataSourcesPage />} />
                <Route path="/schedules" element={<SchedulesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              className: '!bg-white dark:!bg-gray-800 !text-gray-900 dark:!text-gray-100 !border !border-gray-200 dark:!border-gray-700 !shadow-lg',
              duration: 3000,
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
