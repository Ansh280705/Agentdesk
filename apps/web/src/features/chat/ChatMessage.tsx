import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThumbsUp, ThumbsDown, Copy, Check, Wrench, AlertCircle, Pencil, RefreshCw, X, Brain, BookOpen } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { api } from '@/lib/api';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { ChartRenderer } from './ChartRenderer';
import type { Message } from '@/types';
import toast from 'react-hot-toast';

interface ChatMessageProps {
  message: Message;
  conversationId: string;
  onFeedback?: (msgId: string, feedback: 'up' | 'down') => void;
  /** The user question that triggered this answer — used for "Save to Wiki" title */
  promptText?: string;
}

export function ChatMessage({ message, conversationId, onFeedback, promptText }: ChatMessageProps) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(message.feedback ?? null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [wikiSaved, setWikiSaved] = useState(false);
  const [showWikiMenu, setShowWikiMenu] = useState(false);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = async (fb: 'up' | 'down') => {
    if (feedback === fb) return;
    try {
      await api.post(`/conversations/${conversationId}/messages/${message.id}/feedback`, { feedback: fb });
      setFeedback(fb);
      onFeedback?.(message.id, fb);
    } catch {
      toast.error('Could not save feedback');
    }
  };

  // Edit message mutation
  const editMutation = useMutation({
    mutationFn: () => api.patch(`/conversations/${conversationId}/messages/${message.id}`, { content: editContent }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      setEditing(false);
      toast.success('Message updated');
    },
    onError: () => toast.error('Failed to update message'),
  });

  // Save this answer to the workspace knowledge wiki
  const wikiMutation = useMutation({
    mutationFn: (categoryType?: 'fact' | 'document' | 'procedure' | 'note') => {
      const q = (promptText ?? '').replace(/\s+/g, ' ').trim();
      const title = q ? `Q&A: ${q.slice(0, 110)}` : `Brain answer — ${new Date().toLocaleDateString()}`;
      const content = q
        ? `**Question:** ${q}\n\n**Answer:**\n${message.content}`
        : message.content;
      return api.post('/knowledge', { title, content, type: categoryType ?? 'note', tags: ['wiki', 'chat'] });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['knowledge'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setWikiSaved(true);
      setShowWikiMenu(false);
      toast.success(`Saved to knowledge base as ${vars ?? 'note'}`);
    },
    onError: () => toast.error('Could not save to knowledge base'),
  });

  // Regenerate from this point
  const regenerateMutation = useMutation({
    mutationFn: () => api.post(`/conversations/${conversationId}/regenerate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => toast.error('Failed to regenerate response'),
  });

  // Parse chart data embedded in assistant messages
  const chartData = tryParseChart(message.content);

  if (isTool) {
    return (
      <div className="flex items-start gap-2 py-1 px-4">
        <Wrench className="h-3.5 w-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-gray-500">
          <span className="font-medium text-gray-400">{message.tool_name}</span>
          {' '}completed
        </div>
      </div>
    );
  }

  return (
    <div className={cn('group flex gap-3 px-4 py-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5 shadow-sm',
        isUser
          ? 'bg-indigo-600 text-white'
          : 'bg-gradient-to-br from-brand-400 to-brand-700 text-white'
      )}>
        {isUser ? 'U' : <Brain className="h-3.5 w-3.5" />}
      </div>

      {/* Content */}
      <div className={cn('flex-1 min-w-0', isUser && 'flex flex-col items-end')}>
        {editing ? (
          /* Edit mode */
          <div className="w-full max-w-[85%]">
            <textarea
              autoFocus
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setEditing(false); setEditContent(message.content); }
                if (e.key === 'Enter' && e.ctrlKey) editMutation.mutate();
              }}
              className="w-full rounded-xl border border-indigo-500 bg-white/5 dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[80px]"
            />
            <div className="flex gap-2 mt-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setEditContent(message.content); }}>
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
              <Button size="sm" onClick={() => editMutation.mutate()} loading={editMutation.isPending}>
                <Check className="h-3.5 w-3.5" /> Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className={cn(
              'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
              isUser
                ? 'bg-indigo-600 text-white rounded-tr-sm'
                : 'bg-white/[0.05] border border-white/10 text-gray-100 rounded-tl-sm'
            )}>
              {isAssistant ? (
                <div className="prose prose-sm prose-invert max-w-none prose-pre:bg-black/30 prose-pre:text-gray-100 prose-code:text-indigo-300">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
            </div>

            {/* Chart artifact */}
            {chartData && (
              <div className="mt-2 max-w-[85%] w-full">
                <ChartRenderer spec={chartData} />
              </div>
            )}

            {/* Demo mode warning */}
            {message.metadata?.demo && (
              <div className="flex items-center gap-1 mt-1 text-xs text-amber-500">
                <AlertCircle className="h-3 w-3" /> Demo mode — configure GROQ_API_KEY for real AI
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-xs text-gray-600 mr-1">{timeAgo(message.created_at)}</span>

              {isUser && (
                <button
                  onClick={() => setEditing(true)}
                  className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-[#27272a] transition-colors"
                  title="Edit message"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}

              {isAssistant && (
                <>
                  <button
                    onClick={handleCopy}
                    className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-[#27272a] transition-colors"
                    title="Copy"
                  >
                    {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => !wikiSaved && setShowWikiMenu((v) => !v)}
                      className={cn('p-1 rounded transition-colors', wikiSaved ? 'text-green-400' : 'text-gray-500 hover:text-gray-300 hover:bg-[#27272a]')}
                      title={wikiSaved ? 'Saved to knowledge base' : 'Save to knowledge base'}
                      disabled={wikiMutation.isPending || wikiSaved}
                    >
                      {wikiSaved ? <Check className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
                    </button>
                    {showWikiMenu && !wikiSaved && (
                      <div className="absolute right-0 bottom-full mb-1 z-30 w-36 rounded-lg bg-white dark:bg-[#1f232b] border border-gray-200 dark:border-gray-700 shadow-xl py-1 text-xs">
                        <p className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                          Save as category
                        </p>
                        {[
                          { value: 'fact', label: '📌 Fact' },
                          { value: 'document', label: '📄 Document' },
                          { value: 'procedure', label: '📋 Procedure' },
                          { value: 'note', label: '📝 Note' },
                        ].map((cat) => (
                          <button
                            key={cat.value}
                            type="button"
                            onClick={() => wikiMutation.mutate(cat.value as any)}
                            disabled={wikiMutation.isPending}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => regenerateMutation.mutate()}
                    className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-[#27272a] transition-colors"
                    title="Regenerate response"
                    disabled={regenerateMutation.isPending}
                  >
                    <RefreshCw className={cn('h-3 w-3', regenerateMutation.isPending && 'animate-spin')} />
                  </button>
                  <button
                    onClick={() => handleFeedback('up')}
                    className={cn('p-1 rounded hover:bg-[#27272a] transition-colors', feedback === 'up' ? 'text-green-400' : 'text-gray-500 hover:text-gray-300')}
                    title="Good response"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleFeedback('down')}
                    className={cn('p-1 rounded hover:bg-[#27272a] transition-colors', feedback === 'down' ? 'text-red-400' : 'text-gray-500 hover:text-gray-300')}
                    title="Bad response"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function tryParseChart(content: string) {
  try {
    const match = content.match(/```json\n({[\s\S]*?"artifact_type":\s*"chart"[\s\S]*?})\n```/);
    if (match) return JSON.parse(match[1]);
  } catch {}
  return null;
}
