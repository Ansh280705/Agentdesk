import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Trash2, Pencil, Search, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { timeAgo, getErrorMessage } from '@/lib/utils';
import type { KnowledgeDoc } from '@/types';
import toast from 'react-hot-toast';

const TYPE_OPTIONS = [
  { value: 'note', label: 'Note' },
  { value: 'document', label: 'Document' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'fact', label: 'Fact' },
];

const TYPE_VARIANT: Record<string, 'info' | 'success' | 'warning' | 'default'> = {
  note: 'default',
  document: 'info',
  procedure: 'warning',
  fact: 'success',
};

export default function KnowledgePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<KnowledgeDoc | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge', search],
    queryFn: () => api.get(`/knowledge${search ? `?q=${encodeURIComponent(search)}` : ''}`).then((r) => r.data.data as KnowledgeDoc[]),
    staleTime: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/knowledge/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knowledge'] }); toast.success('Document deleted'); },
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Knowledge Base"
        description="Notes, documents, procedures, and facts your agents can search"
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="h-4 w-4" /> Add document
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search knowledge base…"
            className="h-9 w-full rounded-lg border border-gray-300 dark:border-gray-600 pl-9 pr-3 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : !data?.length ? (
          <EmptyState
            icon={BookOpen}
            title={search ? 'No results found' : 'No documents yet'}
            description={search ? 'Try a different search term' : 'Add notes, procedures, and facts that your agents can reference.'}
            action={!search ? { label: 'Add document', onClick: () => { setEditing(null); setShowForm(true); } } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map((doc) => (
              <Card key={doc.id}>
                <CardBody className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{doc.title}</h3>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditing(doc); setShowForm(true); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => deleteMutation.mutate(doc.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{doc.excerpt ?? doc.content?.slice(0, 150)}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={TYPE_VARIANT[doc.type] ?? 'default'}>{doc.type}</Badge>
                    {doc.tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-0.5 text-xs text-gray-400">
                        <Tag className="h-2.5 w-2.5" />{tag}
                      </span>
                    ))}
                    <span className="ml-auto text-xs text-gray-400">{timeAgo(doc.updated_at)}</span>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      <KnowledgeFormDialog open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} doc={editing} />
    </div>
  );
}

function KnowledgeFormDialog({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: KnowledgeDoc | null }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: '', content: '', type: 'note' as KnowledgeDoc['type'], tags: '' });

  useState(() => {
    if (doc) {
      setForm({ title: doc.title, content: doc.content ?? '', type: doc.type, tags: doc.tags.join(', ') });
    } else {
      setForm({ title: '', content: '', type: 'note', tags: '' });
    }
  });

  // Reset on open
  const [initialized, setInitialized] = useState(false);
  if (open && !initialized) {
    setInitialized(true);
    if (doc) setForm({ title: doc.title, content: doc.content ?? '', type: doc.type, tags: doc.tags.join(', ') });
    else setForm({ title: '', content: '', type: 'note', tags: '' });
  }
  if (!open && initialized) setInitialized(false);

  const mutation = useMutation({
    mutationFn: (data: { title: string; content: string; type: string; tags: string[] }) =>
      doc ? api.put(`/knowledge/${doc.id}`, data) : api.post('/knowledge', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge'] });
      toast.success(doc ? 'Document updated' : 'Document added');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      title: form.title,
      content: form.content,
      type: form.type,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title={doc ? 'Edit Document' : 'Add to Knowledge Base'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
        <Select label="Type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as KnowledgeDoc['type'] }))} options={TYPE_OPTIONS} />
        <Textarea label="Content" value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={8} placeholder="Enter your content here…" required />
        <Input label="Tags (comma separated)" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="research, finance, project-x" />
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" loading={mutation.isPending} className="flex-1">{doc ? 'Save changes' : 'Add document'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
