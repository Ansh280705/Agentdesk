import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ListTodo, RefreshCw, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { Select } from '@/components/ui/Select';
import { timeAgo } from '@/lib/utils';
import type { Task } from '@/types';
import toast from 'react-hot-toast';

const STATUS_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'default'> = {
  completed: 'success', running: 'info', queued: 'warning', failed: 'danger', cancelled: 'default',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function TasksPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tasks', statusFilter],
    queryFn: () => api.get(`/tasks${statusFilter ? `?status=${statusFilter}` : ''}`).then((r) => r.data.data as Task[]),
    refetchInterval: 10_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tasks/${id}/cancel`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task cancelled'); },
    onError: () => toast.error('Failed to cancel task'),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tasks/${id}/retry`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task queued for retry'); },
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Tasks"
        description="Background task queue and execution history"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="w-48">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={STATUS_OPTIONS}
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : !data?.length ? (
          <EmptyState
            icon={ListTodo}
            title="No tasks found"
            description="Tasks are created when agents perform background operations."
          />
        ) : (
          <div className="space-y-2">
            {data.map((task) => (
              <Card key={task.id}>
                <CardBody className="py-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setExpanded(expanded === task.id ? null : task.id)}
                      className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                      {expanded === task.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{task.type}</span>
                        <Badge variant={STATUS_VARIANT[task.status] ?? 'default'}>{task.status}</Badge>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {timeAgo(task.created_at)}
                        {task.duration_seconds !== undefined && task.duration_seconds > 0 && ` · ${task.duration_seconds}s`}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {(task.status === 'queued' || task.status === 'running') && (
                        <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate(task.id)} className="text-xs text-red-400 hover:text-red-600">
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {task.status === 'failed' && (
                        <Button variant="ghost" size="sm" onClick={() => retryMutation.mutate(task.id)} className="text-xs">
                          <RefreshCw className="h-3.5 w-3.5" /> Retry
                        </Button>
                      )}
                    </div>
                  </div>

                  {expanded === task.id && (
                    <div className="mt-3 pl-7 space-y-2">
                      {task.error && (
                        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                          {task.error}
                        </div>
                      )}
                      {task.events && task.events.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500">Execution log</p>
                          {task.events.map((ev) => (
                            <div key={ev.id} className="flex items-start gap-2 text-xs text-gray-500">
                              <span className="text-gray-300 flex-shrink-0">{timeAgo(ev.created_at)}</span>
                              <span>{ev.event_type}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
