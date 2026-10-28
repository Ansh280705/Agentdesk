import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Plus, Trash2, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { timeAgo, getErrorMessage } from '@/lib/utils';
import type { DataSource } from '@/types';
import toast from 'react-hot-toast';

interface Connector { type: string; name: string; description: string; status: string; required_config: string[] }

const STATUS_ICON = { connected: CheckCircle, disconnected: XCircle, error: XCircle, pending: Clock };
const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
  connected: 'success', disconnected: 'default', error: 'danger', pending: 'warning',
};

export default function DataSourcesPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: connectors } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => api.get('/data-sources/connectors').then((r) => r.data.data as Connector[]),
  });

  const { data: sources, isLoading } = useQuery({
    queryKey: ['data-sources'],
    queryFn: () => api.get('/data-sources').then((r) => r.data.data as DataSource[]),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.post(`/data-sources/${id}/test`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['data-sources'] });
      const r = res.data.data as { success: boolean; message: string };
      if (r.success) toast.success(r.message);
      else toast.error(r.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/data-sources/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['data-sources'] }); toast.success('Data source removed'); },
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Data Sources"
        description="Connect external data for your agents to query"
        actions={<Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Connect source</Button>}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Connected sources */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Connected Sources</h2>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          ) : !sources?.length ? (
            <EmptyState icon={Database} title="No data sources" description="Connect a data source to let agents query real data." action={{ label: 'Connect source', onClick: () => setShowAdd(true) }} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sources.map((src) => {
                const Icon = STATUS_ICON[src.status] ?? Clock;
                return (
                  <Card key={src.id}>
                    <CardBody className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                          <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{src.name}</p>
                          <p className="text-xs text-gray-400">{src.type} {src.last_synced_at && `· Last synced ${timeAgo(src.last_synced_at)}`}</p>
                        </div>
                        <Badge variant={STATUS_VARIANT[src.status] ?? 'default'}>
                          <Icon className="h-3 w-3" /> {src.status}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => testMutation.mutate(src.id)} loading={testMutation.isPending} className="flex-1 text-xs">
                          <RefreshCw className="h-3 w-3" /> Test connection
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(src.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Available connectors */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Available Connectors</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(connectors ?? []).map((conn) => (
              <div key={conn.type} className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-4 flex items-start gap-3">
                <Database className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{conn.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{conn.description}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowAdd(true)} className="text-xs flex-shrink-0">Connect</Button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <AddSourceDialog open={showAdd} onClose={() => setShowAdd(false)} connectors={connectors ?? []} />
    </div>
  );
}

function AddSourceDialog({ open, onClose, connectors }: { open: boolean; onClose: () => void; connectors: Connector[] }) {
  const qc = useQueryClient();
  const [type, setType] = useState('json_api');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post('/data-sources', { name, type, config: { url } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['data-sources'] });
      toast.success('Data source added');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Connect Data Source" size="md">
      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
        <Select
          label="Connector type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={connectors.map((c) => ({ value: c.type, label: c.name }))}
        />
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Data Source" required />
        {type === 'json_api' && (
          <Input label="API URL" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/data" required />
        )}
        {(type === 'google_sheets' || type === 'postgres_readonly') && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
            This connector requires additional setup. After adding, click "Test connection" and follow the instructions.
          </div>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" loading={mutation.isPending} className="flex-1">Add source</Button>
        </div>
      </form>
    </Dialog>
  );
}
