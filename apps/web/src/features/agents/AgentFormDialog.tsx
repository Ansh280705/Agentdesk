import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { getErrorMessage } from '@/lib/utils';
import type { Agent } from '@/types';
import toast from 'react-hot-toast';

const MODELS = [
  { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (Recommended)' },
  { value: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B (Fast)' },
  { value: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B' },
  { value: 'allam-2-7b', label: 'Allam 2 7B' },
];

interface AgentFormDialogProps {
  open: boolean;
  onClose: () => void;
  agent?: Agent | null;
}

export function AgentFormDialog({ open, onClose, agent }: AgentFormDialogProps) {
  const qc = useQueryClient();
  const isEditing = !!agent;

  const [form, setForm] = useState({
    name: '',
    description: '',
    system_prompt: '',
    model: 'llama-3.3-70b-versatile',
    max_tool_calls: 10,
    max_iterations: 5,
    requires_approval: false,
    is_enabled: true,
    allowed_tools: [] as string[],
  });

  const { data: toolsData } = useQuery({
    queryKey: ['tools'],
    queryFn: () => api.get('/agents/tools').then((r) => r.data.data as { name: string; description: string }[]),
  });

  useEffect(() => {
    if (agent) {
      setForm({
        name: agent.name,
        description: agent.description,
        system_prompt: agent.system_prompt,
        model: agent.model,
        max_tool_calls: agent.max_tool_calls,
        max_iterations: agent.max_iterations,
        requires_approval: agent.requires_approval,
        is_enabled: agent.is_enabled,
        allowed_tools: agent.allowed_tools,
      });
    } else {
      setForm({
        name: '',
        description: '',
        system_prompt: 'You are a helpful AI assistant.',
        model: 'llama-3.3-70b-versatile',
        max_tool_calls: 10,
        max_iterations: 5,
        requires_approval: false,
        is_enabled: true,
        allowed_tools: ['get_current_datetime', 'calculator'],
      });
    }
  }, [agent, open]);

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      isEditing
        ? api.put(`/agents/${agent!.id}`, data)
        : api.post('/agents', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      toast.success(isEditing ? 'Agent updated' : 'Agent created');
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const toggleTool = (toolName: string) => {
    setForm((f) => ({
      ...f,
      allowed_tools: f.allowed_tools.includes(toolName)
        ? f.allowed_tools.filter((t) => t !== toolName)
        : [...f.allowed_tools, toolName],
    }));
  };

  const set = (field: keyof typeof form) => (value: string | number | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onClose={onClose} title={isEditing ? 'Edit Agent' : 'Create Agent'} size="xl">
      <form
        onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }}
        className="space-y-4 max-h-[70vh] overflow-y-auto pr-1"
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name" value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Research Assistant" required />
          <Select
            label="Model"
            value={form.model}
            onChange={(e) => set('model')(e.target.value)}
            options={MODELS}
          />
        </div>

        <Input label="Description" value={form.description} onChange={(e) => set('description')(e.target.value)} placeholder="What does this agent do?" />

        <Textarea
          label="System Instructions"
          value={form.system_prompt}
          onChange={(e) => set('system_prompt')(e.target.value)}
          rows={5}
          placeholder="You are a helpful assistant that..."
        />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Max Tool Calls</label>
            <input
              type="number" min={1} max={50} value={form.max_tool_calls}
              onChange={(e) => set('max_tool_calls')(parseInt(e.target.value))}
              className="h-9 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Max Iterations</label>
            <input
              type="number" min={1} max={20} value={form.max_iterations}
              onChange={(e) => set('max_iterations')(parseInt(e.target.value))}
              className="h-9 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-6">
          <Toggle
            checked={form.is_enabled}
            onChange={(v) => set('is_enabled')(v)}
            label="Enabled"
          />
          <Toggle
            checked={form.requires_approval}
            onChange={(v) => set('requires_approval')(v)}
            label="Require approval for actions"
          />
        </div>

        {toolsData && (
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Allowed Tools</p>
            <div className="grid grid-cols-2 gap-2">
              {toolsData.map((tool) => (
                <label key={tool.name} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allowed_tools.includes(tool.name)}
                    onChange={() => toggleTool(tool.name)}
                    className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{tool.name}</p>
                    <p className="text-xs text-gray-400 leading-tight">{tool.description.slice(0, 60)}…</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" loading={mutation.isPending} className="flex-1">
            {isEditing ? 'Save changes' : 'Create agent'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
