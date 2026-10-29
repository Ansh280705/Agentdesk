import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Plus, Trash2, Play, ToggleLeft, ToggleRight, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { useQuery as useAgentsQuery } from '@tanstack/react-query';
import { timeAgo, getErrorMessage } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Schedule {
  id: string;
  name: string;
  agent_id?: string;
  prompt: string;
  cron_expression?: string;
  interval_minutes?: number;
  is_active: boolean;
  last_run_at?: string;
  next_run_at?: string;
  created_at: string;
}

export default function SchedulesPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => api.get('/schedules').then((r) => r.data.data as Schedule[]),
    refetchInterval: 30_000,
  });

  const { data: agents } = useAgentsQuery({
    queryKey: ['agents'],
    queryFn: () => api.get('/agents').then((r) => r.data.data as { id: string; name: string }[]),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/schedules/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/schedules/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedules'] }); toast.success('Schedule deleted'); },
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => api.post(`/schedules/${id}/run`),
    onSuccess: (res) => {
      toast.success('Schedule triggered — check conversations');
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Schedules"
        description="Set up recurring tasks that run your agents automatically"
        actions={<Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> New schedule</Button>}
      />
      <div className="flex-1 overflow-y-auto p-6 bg-[#0f0f0f]">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : !data?.length ? (
          <EmptyState
            icon={Clock}
            title="No schedules yet"
            description="Create a scheduled task to run your agent automatically on a recurring basis."
            action={{ label: 'Create schedule', onClick: () => setShowAdd(true) }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((sched) => (
              <Card key={sched.id} className="bg-[#1a1a1a] border-[#27272a]">
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-[#27272a] flex items-center justify-center">
                        <Clock className="h-4 w-4 text-[#8dbea5]" />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-100">{sched.name}</h3>
                        <Badge variant={sched.is_active ? 'success' : 'default'} className="mt-0.5">
                          {sched.is_active ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => runMutation.mutate(sched.id)} title="Run now">
                        <Play className="h-3.5 w-3.5 text-green-400" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleMutation.mutate(sched.id)} title="Toggle">
                        {sched.is_active ? <ToggleRight className="h-4 w-4 text-green-400" /> : <ToggleLeft className="h-4 w-4 text-gray-500" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(sched.id)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-400 line-clamp-2">{sched.prompt}</p>

                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {sched.interval_minutes ? `Every ${sched.interval_minutes}m` : sched.cron_expression || 'Manual'}
                    </span>
                    {sched.last_run_at && <span>Last run: {timeAgo(sched.last_run_at)}</span>}
                    {sched.next_run_at && sched.is_active && <span>Next: {timeAgo(sched.next_run_at)}</span>}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AddScheduleDialog open={showAdd} onClose={() => setShowAdd(false)} agents={agents ?? []} />
    </div>
  );
}

function AddScheduleDialog({ open, onClose, agents }: { open: boolean; onClose: () => void; agents: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', prompt: '', interval_minutes: 60, agent_id: '' });

  const mutation = useMutation({
    mutationFn: () => api.post('/schedules', {
      name: form.name,
      prompt: form.prompt,
      interval_minutes: form.interval_minutes,
      agent_id: form.agent_id || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      toast.success('Schedule created');
      setForm({ name: '', prompt: '', interval_minutes: 60, agent_id: '' });
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const intervalOptions = [
    { value: '15', label: 'Every 15 minutes' },
    { value: '30', label: 'Every 30 minutes' },
    { value: '60', label: 'Every 1 hour' },
    { value: '360', label: 'Every 6 hours' },
    { value: '720', label: 'Every 12 hours' },
    { value: '1440', label: 'Every 24 hours' },
  ];

  return (
    <Dialog open={open} onClose={onClose} title="Create Schedule" size="md">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
        <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Daily metrics check" required />
        <Textarea label="Prompt" value={form.prompt} onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))} rows={3} placeholder="Check the latest dashboard metrics and summarize any anomalies" required />
        <Select
          label="Run frequency"
          value={String(form.interval_minutes)}
          onChange={(e) => setForm((f) => ({ ...f, interval_minutes: parseInt(e.target.value) }))}
          options={intervalOptions}
        />
        {agents.length > 0 && (
          <Select
            label="Agent (optional)"
            value={form.agent_id}
            onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
            options={[{ value: '', label: 'Default agent' }, ...agents.map((a) => ({ value: a.id, label: a.name }))]}
          />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" loading={mutation.isPending} className="flex-1">Create schedule</Button>
        </div>
      </form>
    </Dialog>
  );
}
