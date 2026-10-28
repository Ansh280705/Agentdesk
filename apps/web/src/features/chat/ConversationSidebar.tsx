import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MessageSquare, Trash2, Pencil, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { cn, truncate, timeAgo } from '@/lib/utils';
import type { Conversation } from '@/types';
import toast from 'react-hot-toast';

export function ConversationSidebar() {
  const navigate = useNavigate();
  const { id: activeId } = useParams();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const { data } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get('/conversations?per_page=50').then((r) => r.data.data as Conversation[]),
    refetchInterval: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/conversations', { title: 'New Conversation' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      navigate(`/chat/${res.data.data.id}`);
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch(`/conversations/${id}`, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/conversations/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      if (activeId === id) navigate('/chat');
      toast.success('Conversation deleted');
    },
  });

  const startEdit = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  return (
    <div className="flex flex-col h-full border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 w-60">
      <div className="p-3 border-b border-gray-200 dark:border-gray-800">
        <Button
          className="w-full justify-start gap-2"
          size="sm"
          onClick={() => createMutation.mutate()}
          loading={createMutation.isPending}
        >
          <Plus className="h-4 w-4" /> New conversation
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {data?.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              'group flex items-center gap-1 rounded-lg px-2 py-2 cursor-pointer transition-colors',
              activeId === conv.id
                ? 'bg-brand-50 dark:bg-brand-950'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
            )}
            onClick={() => !editingId && navigate(`/chat/${conv.id}`)}
          >
            <MessageSquare className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            {editingId === conv.id ? (
              <div className="flex flex-1 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameMutation.mutate({ id: conv.id, title: editTitle });
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 text-xs bg-transparent border-b border-brand-500 outline-none text-gray-900 dark:text-gray-100"
                />
                <button onClick={() => renameMutation.mutate({ id: conv.id, title: editTitle })} className="text-green-500 hover:text-green-600">
                  <Check className="h-3 w-3" />
                </button>
                <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-xs truncate', activeId === conv.id ? 'font-medium text-brand-700 dark:text-brand-400' : 'text-gray-700 dark:text-gray-300')}>
                    {truncate(conv.title, 30)}
                  </p>
                  <p className="text-xs text-gray-400">{timeAgo(conv.updated_at)}</p>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(conv); }}
                    className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(conv.id); }}
                    className="p-1 rounded text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
