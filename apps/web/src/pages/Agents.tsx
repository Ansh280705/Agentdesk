import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Bot, Trash2, Copy, ToggleLeft, ToggleRight, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { AgentFormDialog } from '@/features/agents/AgentFormDialog';
import type { Agent } from '@/types';
import toast from 'react-hot-toast';

export default function AgentsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get('/agents').then((r) => r.data.data as Agent[]),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); toast.success('Agent deleted'); },
    onError: () => toast.error('Failed to delete agent'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/agents/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/agents/${id}/duplicate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); toast.success('Agent duplicated'); },
  });

  const templates = data?.filter((a) => a.is_template) ?? [];
  const custom = data?.filter((a) => !a.is_template) ?? [];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Agents"
        description="Create and manage AI agents with custom instructions and tools"
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="h-4 w-4" /> New agent
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <>
            {templates.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Starter Templates</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      onEdit={() => { setEditing(agent); setShowForm(true); }}
                      onDelete={() => deleteMutation.mutate(agent.id)}
                      onToggle={() => toggleMutation.mutate(agent.id)}
                      onDuplicate={() => duplicateMutation.mutate(agent.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Your Agents</h2>
              {custom.length === 0 ? (
                <EmptyState
                  icon={Bot}
                  title="No custom agents yet"
                  description="Create an agent with custom instructions and a specific set of tools."
                  action={{ label: 'Create agent', onClick: () => { setEditing(null); setShowForm(true); } }}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {custom.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      onEdit={() => { setEditing(agent); setShowForm(true); }}
                      onDelete={() => deleteMutation.mutate(agent.id)}
                      onToggle={() => toggleMutation.mutate(agent.id)}
                      onDuplicate={() => duplicateMutation.mutate(agent.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <AgentFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        agent={editing}
      />
    </div>
  );
}

function AgentCard({ agent, onEdit, onDelete, onToggle, onDuplicate }: {
  agent: Agent;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
}) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{agent.name}</h3>
              <Badge variant={agent.is_enabled ? 'success' : 'default'} className="mt-0.5">
                {agent.is_enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>
          {agent.is_template && <Badge variant="info">Template</Badge>}
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{agent.description || 'No description'}</p>

        <div className="text-xs text-gray-400 space-y-1">
          <div className="flex items-center justify-between">
            <span>Model</span><span className="font-mono text-gray-600 dark:text-gray-300 truncate max-w-[140px]">{agent.model}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Tools</span><span className="text-gray-600 dark:text-gray-300">{agent.allowed_tools.length}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 pt-1 border-t border-gray-100 dark:border-gray-800">
          <Button variant="ghost" size="sm" onClick={onEdit} className="flex-1 text-xs">
            <Pencil className="h-3 w-3" /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggle} className="text-xs">
            {agent.is_enabled ? <ToggleRight className="h-3 w-3 text-green-500" /> : <ToggleLeft className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDuplicate} className="text-xs">
            <Copy className="h-3 w-3" />
          </Button>
          {!agent.is_template && (
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-xs text-red-400 hover:text-red-600">
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
