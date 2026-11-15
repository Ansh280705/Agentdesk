import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Users, Brain } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { cn, timeAgo } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

interface RoomInfo { id: string; title: string; is_shared: boolean }
interface RoomMember { id: string; name: string; handle: string; email?: string; is_bot: boolean }
interface RoomMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  user_id: string | null;
  author_name: string | null;
  metadata: { mentions?: Array<{ user_id: string; handle: string; name: string }> } | null;
  created_at: string;
}

/** Render message text with @mentions highlighted (extra style when it's you). */
function MessageText({ content, meHandle }: { content: string; meHandle: string }) {
  const parts = content.split(/(@[\w]+)/g);
  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (!part.startsWith('@')) return <span key={i}>{part}</span>;
        const handle = part.slice(1).toLowerCase();
        const isMe = handle === meHandle;
        const isBrain = handle === 'brain';
        return (
          <span
            key={i}
            className={cn(
              'rounded px-0.5 font-medium',
              isMe
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                : isBrain
                  ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            )}
          >
            {part}
          </span>
        );
      })}
    </p>
  );
}

export default function RoomPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [brainThinking, setBrainThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const meHandle = (user?.name?.split(/\s+/)[0] || user?.email?.split('@')[0] || '').toLowerCase();

  // Shared room (lazily created server-side)
  const { data: room } = useQuery({
    queryKey: ['room'],
    queryFn: () => api.get('/room').then((r) => r.data.data as RoomInfo),
  });

  // Members for the @ picker
  const { data: members } = useQuery({
    queryKey: ['room-members'],
    queryFn: () => api.get('/room/members').then((r) => r.data.data as RoomMember[]),
  });

  // Poll messages every 3s so other users' messages appear
  const { data: messages, isLoading } = useQuery({
    queryKey: ['room-messages', room?.id],
    queryFn: () => api.get(`/room/${room!.id}/messages`).then((r) => r.data.data as RoomMessage[]),
    enabled: !!room?.id,
    refetchInterval: 2000,
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const willCallBrain = /@brain\b/i.test(content);
      if (willCallBrain) setBrainThinking(true);
      const res = await api.post(`/room/${room!.id}/messages`, { content });
      return res.data.data;
    },
    onSuccess: () => {
      setBrainThinking(false);
      qc.invalidateQueries({ queryKey: ['room-messages', room?.id] });
    },
    onError: (err: unknown) => {
      setBrainThinking(false);
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to send';
      toast.error(msg);
    },
  });

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, brainThinking]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [input]);

  // ── @ mention detection ──────────────────────────────────────────
  const updateMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at >= 0 && (at === 0 || /\s/.test(before[at - 1]))) {
      const token = before.slice(at + 1);
      if (/^[\w]*$/.test(token)) {
        setMentionStart(at);
        setMentionQuery(token);
        setMentionOpen(true);
        setMentionIdx(0);
        return;
      }
    }
    setMentionOpen(false);
  };

  const filteredMembers = (members ?? []).filter((m) =>
    m.handle.toLowerCase().startsWith(mentionQuery.toLowerCase()) ||
    m.name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const pickMention = (m: RoomMember) => {
    const caret = textareaRef.current?.selectionStart ?? input.length;
    const before = input.slice(0, mentionStart);
    const after = input.slice(caret);
    const next = `${before}@${m.handle} ${after}`;
    setInput(next);
    setMentionOpen(false);
    textareaRef.current?.focus();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    updateMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => (i + 1) % filteredMembers.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((i) => (i - 1 + filteredMembers.length) % filteredMembers.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(filteredMembers[mentionIdx]); return; }
      if (e.key === 'Escape') { setMentionOpen(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const content = input.trim();
    if (!content || sendMutation.isPending || !room) return;
    setInput('');
    setMentionOpen(false);
    sendMutation.mutate(content);
  };

  const visible = (messages ?? []).filter((m) => m.role !== 'tool');

  return (
    <div className="flex flex-col flex-1 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <Users className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {room?.title ?? 'Workspace Room'}
        </h2>
        <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
          {members?.length ?? 0} members · tag @brain to get an AI reply
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-6 space-y-4"><SkeletonText lines={3} /><SkeletonText lines={2} /></div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 gap-2">
            <p className="text-sm text-gray-500">No messages yet — this room is shared by everyone in the workspace.</p>
            <p className="text-xs text-gray-400">Type @ to mention a teammate, or @brain to ask the AI.</p>
          </div>
        ) : (
          <div className="py-4 space-y-1">
            {visible.map((msg) => {
              const isBrainMsg = msg.role === 'assistant';
              const mine = msg.user_id === user?.id;
              return (
                <div key={msg.id} className={cn('flex gap-3 px-4 py-2.5', mine && 'bg-brand-50/50 dark:bg-brand-950/20')}>
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 mt-0.5',
                    isBrainMsg ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  )}>
                    {isBrainMsg ? <Brain className="h-3.5 w-3.5" /> : (msg.author_name?.charAt(0).toUpperCase() ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                        {isBrainMsg ? 'Brain' : msg.author_name ?? 'Unknown'}
                        {mine && <span className="ml-1 text-[10px] font-normal text-gray-400">(you)</span>}
                      </span>
                      <span className="text-[10px] text-gray-400">{timeAgo(msg.created_at)}</span>
                    </div>
                    <MessageText content={msg.content} meHandle={meHandle} />
                  </div>
                </div>
              );
            })}

            {brainThinking && (
              <div className="flex gap-3 px-4 py-2.5">
                <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center flex-shrink-0">
                  <Brain className="h-3.5 w-3.5 text-brand-600 dark:text-brand-300" />
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <div className="relative flex-1">
            {/* Mention dropdown */}
            {mentionOpen && filteredMembers.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-10">
                {filteredMembers.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickMention(m); }}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                      i === mentionIdx ? 'bg-indigo-100 dark:bg-indigo-800' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    )}
                  >
                    <span className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0',
                      m.is_bot ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    )}>
                      {m.is_bot ? <Brain className="h-3 w-3" /> : m.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate text-gray-900 dark:text-gray-100">{m.name}</span>
                    <span className="text-xs text-gray-400">@{m.handle}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Message the room… (@ to mention, @brain for AI)"
                disabled={sendMutation.isPending}
                rows={1}
                className={cn(
                  'w-full px-4 py-3 text-sm bg-transparent resize-none outline-none',
                  'text-gray-900 dark:text-gray-100 placeholder:text-gray-400',
                  'disabled:opacity-50'
                )}
              />
            </div>
          </div>
          <Button type="submit" size="icon" disabled={!input.trim() || sendMutation.isPending} loading={sendMutation.isPending} title="Send (Enter)">
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="text-xs text-gray-400 mt-1.5 text-center">Messages without @brain are just stored — no AI call is made</p>
      </div>
    </div>
  );
}
