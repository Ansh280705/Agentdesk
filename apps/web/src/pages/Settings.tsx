import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sun, Moon, Monitor, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/layout/PageHeader';
import { getErrorMessage } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user, updatePreferences, preferences } = useAuth();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(user?.name ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => { setName(user?.name ?? ''); }, [user]);

  const { data: healthData } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/health').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const { data: activity } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.get('/settings/activity').then((r) => r.data.data),
  });

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch('/settings/profile', { name });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleThemeChange = async (t: 'light' | 'dark' | 'system') => {
    setTheme(t);
    try { await updatePreferences({ theme: t }); } catch {}
  };

  const health = healthData as {
    status: string;
    services: {
      database: { configured: boolean; connected: boolean; message: string };
      redis: { configured: boolean; connected: boolean; message: string };
      groq: { configured: boolean; message: string };
    };
    configuration: { warnings: string[] };
  } | undefined;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Settings" description="Manage your account and workspace preferences" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-2xl">
        {/* Profile */}
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Profile</h2></CardHeader>
          <CardBody>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-brand-600 flex items-center justify-center text-white text-lg font-semibold">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name}</p>
                  <p className="text-xs text-gray-400">{user?.email}</p>
                </div>
              </div>
              <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button type="submit" loading={savingProfile} size="sm">Save profile</Button>
            </form>
          </CardBody>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Appearance</h2></CardHeader>
          <CardBody>
            <p className="text-xs text-gray-500 mb-3">Choose your preferred color theme</p>
            <div className="flex gap-2">
              {([
                { value: 'light', icon: Sun, label: 'Light' },
                { value: 'dark', icon: Moon, label: 'Dark' },
                { value: 'system', icon: Monitor, label: 'System' },
              ] as const).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => handleThemeChange(value)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    theme === value
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* System health */}
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">System Status</h2></CardHeader>
          <CardBody className="space-y-3">
            {health ? (
              <>
                {[
                  { label: 'Database', cfg: health.services?.database },
                  { label: 'Redis', cfg: health.services?.redis },
                  { label: 'Groq AI', cfg: health.services?.groq },
                ].map(({ label, cfg }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{cfg?.message}</span>
                      {(cfg as { connected?: boolean; configured?: boolean })?.connected === true || cfg?.configured ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400" />
                      )}
                    </div>
                  </div>
                ))}
                {health.configuration?.warnings?.map((w: string) => (
                  <div key={w} className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                    <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">{w}</p>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-gray-400">Loading status…</p>
            )}
          </CardBody>
        </Card>

        {/* Recent activity */}
        {activity && activity.length > 0 && (
          <Card>
            <CardHeader><h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent Activity</h2></CardHeader>
            <CardBody>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activity.slice(0, 20).map((log: { action: string; resource_type: string; created_at: string }, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">{log.action}</span>
                    <span className="text-gray-400">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
