import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Download, Trash2, BarChart2, FileCode, Table, File } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Dialog } from '@/components/ui/Dialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { ChartRenderer } from '@/features/chat/ChartRenderer';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatBytes, timeAgo } from '@/lib/utils';
import type { Artifact } from '@/types';
import toast from 'react-hot-toast';

const TYPE_ICON = {
  chart: BarChart2,
  markdown: FileText,
  report: FileText,
  csv: Table,
  json: FileCode,
  table: Table,
};

const TYPE_VARIANT: Record<string, 'info' | 'success' | 'warning' | 'default'> = {
  chart: 'info',
  markdown: 'success',
  report: 'success',
  csv: 'warning',
  json: 'default',
  table: 'default',
};

export default function ArtifactsPage() {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<Artifact | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['artifacts'],
    queryFn: () => api.get('/artifacts').then((r) => r.data.data as Artifact[]),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/artifacts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['artifacts'] }); toast.success('Artifact deleted'); },
  });

  const handleDownload = async (artifact: Artifact) => {
    const res = await api.get(`/artifacts/${artifact.id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async (artifact: Artifact) => {
    if (!artifact.content) {
      const res = await api.get(`/artifacts/${artifact.id}`);
      setPreview(res.data.data);
    } else {
      setPreview(artifact);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Artifacts"
        description="Generated reports, charts, CSV exports, and documents"
      />
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : !data?.length ? (
          <EmptyState
            icon={FileText}
            title="No artifacts yet"
            description="Artifacts are generated when you ask the AI to create reports, charts, or export data."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map((artifact) => {
              const Icon = TYPE_ICON[artifact.type] ?? File;
              return (
                <Card key={artifact.id} onClick={() => handlePreview(artifact)}>
                  <CardBody className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{artifact.name}</p>
                        <p className="text-xs text-gray-400">{formatBytes(artifact.size_bytes)} · {timeAgo(artifact.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant={TYPE_VARIANT[artifact.type] ?? 'default'}>{artifact.type}</Badge>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(artifact)} title="Download">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(artifact.id)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview?.name} size="xl">
        {preview && (
          <div className="max-h-[60vh] overflow-y-auto">
            {preview.type === 'chart' ? (
              <ChartRenderer spec={JSON.parse(preview.content ?? '{}')} />
            ) : preview.type === 'markdown' || preview.type === 'report' ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.content ?? ''}</ReactMarkdown>
              </div>
            ) : (
              <pre className="text-xs bg-gray-50 dark:bg-gray-800 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
                {preview.content ?? '(empty)'}
              </pre>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
