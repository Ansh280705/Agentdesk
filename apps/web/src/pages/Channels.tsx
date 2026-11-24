import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Hash, Lock, Send, Brain, Users, MessageSquare, Copy, Trash2, Check, SmilePlus,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

interface Channel {
  id: string; name: string; kind: 'channel' | 'dm'; visibility: 'public' | 'private';
  is_member: boolean; member_count: number; unread_count: number;
  peer_name?: string; peer_id?: string;
}
interface Member { id: string; name: string; handle: string; email?: string; is_bot: boolean }
interface RoomMessage {
  id: string; role: 'user' | 'assistant' | 'tool'; content: string;
  user_id: string | null; author_name: string | null; created_at: string;
  metadata: { mentions?: Array<{ user_id: string; handle: string; name: string }> } | null;
  reactions: Array<{ emoji: string; count: number; mine: boolean }>;
}
const QUICK_EMOJIS = ['👍', '❤️', '😂', '👀', '🎉', '🔥'];

/** Brain replies render as markdown; user messages as mention-highlighted text. */
function BrainMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm text-gray-800 dark:text-gray-200 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:bg-gray-100 [&_code]:dark:bg-gray-800 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-gray-100 [&_pre]:dark:bg-gray-800 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_strong]:font-semibold [&_a]:text-brand-600 [&_a]:underline [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_th]:border [&_th]:border-gray-300 [&_th]:px-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

/** Render message text: clickable links + @mentions highlighted (amber when it's you). */
function MessageText({ content, meHandle }: { content: string; meHandle: string }) {
  const parts = content.split(/(https?:\/\/[^\s]+|@[\w]+)/g);
  return (
    <p className="text-sm whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200">
      {parts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
          return <a key={i} href={part} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 underline underline-offset-2 break-all">{part}</a>;
        }
        if (!part.startsWith('@')) return <span key={i}>{part}</span>;
        const h = part.slice(1).toLowerCase();
        const cls = h === meHandle
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
          : h === 'brain'
            ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
            : h === 'all'
              ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
        return <span key={i} className={cn('rounded px-0.5 font-medium', cls)}>{part}</span>;
      })}
    </p>
  );
}

function sameDay(a: string, b: string) {
  const d1 = new Date(a), d2 = new Date(b);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d.toISOString(), now.toISOString())) return 'Today';
  if (sameDay(d.toISOString(), new Date(now.getTime() - 864e5).toISOString())) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Deterministic avatar gradient from a name — same person, same color. */
function avatarColor(name: string) {
  const hues = [0, 30, 150, 200, 260, 320, 90, 180];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const hue = hues[h % hues.length];
  return `linear-gradient(135deg, hsl(${hue},55%,55%), hsl(${(hue + 40) % 360},55%,45%))`;
}

function Avatar({ name, isBrain }: { name: string; isBrain: boolean }) {
  if (isBrain) {
    return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-sm">
        <Brain className="h-3.5 w-3.5" />
      </div>
    );
  }
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white flex-shrink-0 mt-0.5 shadow-sm"
      style={{ background: avatarColor(name || '?') }}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

/** Copy / react / delete actions shown on message hover. */
function HoverActions({ msg, mine, copiedId, onCopy, onReact, onDelete }: {
  msg: RoomMessage;
  mine: boolean;
  copiedId: string | null;
  onCopy: (msg: RoomMessage) => void;
  onReact: (msg: RoomMessage, emoji: string) => void;
  onDelete: (id: string) => void;
}) {
  const [picker, setPicker] = useState(false);
  return (
    <div className="absolute -top-3 right-4 hidden group-hover:flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm px-1 py-0.5 z-10 animate-pop-in">
      <div className="relative">
        <button
          onClick={() => setPicker((p) => !p)}
          title="React"
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
        {picker && (
          <div className="absolute right-0 top-full mt-1 flex gap-0.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md p-1 animate-pop-in">
            {QUICK_EMOJIS.map((e) => (
              <button key={e} onClick={() => { setPicker(false); onReact(msg, e); }} className="text-base hover:scale-125 active:scale-95 transition-transform px-0.5">{e}</button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => onCopy(msg)}
        title="Copy"
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        {copiedId === msg.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {mine && (
        <button
          onClick={() => onDelete(msg.id)}
          title="Delete"
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Reaction pills under a message. */
function ReactionPills({ msg, onReact }: { msg: RoomMessage; onReact: (msg: RoomMessage, emoji: string) => void }) {
  if (!msg.reactions || msg.reactions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1 animate-fade-in">
      {msg.reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onReact(msg, r.emoji)}
          className={cn(
            'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-all active:scale-90',
            r.mine
              ? 'bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-950/40 dark:border-brand-700 dark:text-brand-300'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'
          )}
        >
          <span>{r.emoji}</span>
          <span className="text-[10px] font-medium">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

export default function ChannelsPage() {
  const { id: activeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [input, setInput] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [brainThinking, setBrainThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const [unreadMarker, setUnreadMarker] = useState<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Messages created after mount animate in; history loads static
  const mountAt = useRef(Date.now());

  const meHandle = (user?.name?.split(/\s+/)[0] || user?.email?.split('@')[0] || '').toLowerCase();

  // ── Data ──────────────────────────────────────────────────────────
  const { data: channelData } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.get('/channels').then((r) => r.data.data as { channels: Channel[]; mention_count: number }),
    refetchInterval: 5000,
  });
  const channels = channelData?.channels ?? [];
  const channelList = channels.filter((c) => c.kind === 'channel');
  const active = channels.find((c) => c.id === activeId);

  const { data: members } = useQuery({
    queryKey: ['channel-users'],
    queryFn: () => api.get('/channels/users').then((r) => r.data.data as Member[]),
  });

  // Typing indicator + presence heartbeat
  const { data: typingNames } = useQuery({
    queryKey: ['typing', activeId],
    queryFn: () => api.get(`/presence/typing/${activeId}`).then((r) => r.data.data as string[]),
    enabled: !!activeId,
    refetchInterval: 2500,
  });
  const { data: onlineUsers } = useQuery({
    queryKey: ['presence'],
    queryFn: () => api.post('/presence/heartbeat').then((r) => r.data.data as Array<{ id: string; name: string }>),
    refetchInterval: 20000,
  });
  const onlineIds = new Set((onlineUsers ?? []).map((u) => u.id));
  const typingPing = useRef(0);
  const pingTyping = () => {
    if (!activeId) return;
    const now = Date.now();
    if (now - typingPing.current < 3000) return;
    typingPing.current = now;
    api.post(`/presence/typing/${activeId}`).catch(() => {});
  };

  const { data: messages, isLoading } = useQuery({
    queryKey: ['channel-messages', activeId],
    queryFn: () => api.get(`/channels/${activeId}/messages`).then((r) => r.data.data as RoomMessage[]),
    enabled: !!activeId,
    refetchInterval: 2000,
  });

  // ── Mutations ─────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (/@brain\b/i.test(content)) setBrainThinking(true);
      const res = await api.post(`/channels/${activeId}/messages`, { content });
      return res.data.data;
    },
    // Optimistic send — show the message immediately
    onMutate: (content) => {
      const optimistic: RoomMessage = {
        id: `optimistic-${Date.now()}`,
        role: 'user',
        content,
        user_id: user?.id ?? null,
        author_name: user?.name ?? 'You',
        created_at: new Date().toISOString(),
        metadata: null,
        reactions: [],
      };
      qc.setQueryData<RoomMessage[]>(['channel-messages', activeId], (old) => [...(old ?? []), optimistic]);
      return { optimisticId: optimistic.id };
    },
    onSuccess: () => {
      setBrainThinking(false);
    },
    onError: (err: unknown, content, context) => {
      setBrainThinking(false);
      // Roll back the optimistic message and restore the draft
      qc.setQueryData<RoomMessage[]>(['channel-messages', activeId], (old) =>
        (old ?? []).filter((m) => m.id !== context?.optimisticId));
      setInput(content);
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to send');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['channel-messages', activeId] });
      qc.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  const reactMutation = useMutation({
    mutationFn: ({ msgId, emoji }: { msgId: string; emoji: string }) =>
      api.post(`/channels/${activeId}/messages/${msgId}/reactions`, { emoji }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel-messages', activeId] }),
  });
  const onReact = (msg: RoomMessage, emoji: string) => reactMutation.mutate({ msgId: msg.id, emoji });

  const deleteMutation = useMutation({
    mutationFn: (msgId: string) => api.delete(`/channels/${activeId}/messages/${msgId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channel-messages', activeId] }),
    onError: () => toast.error('Could not delete message'),
  });

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyMessage = (msg: RoomMessage) => {
    navigator.clipboard.writeText(msg.content).catch(() => {});
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 1200);
  };

  const joinMutation = useMutation({
    mutationFn: () => api.post(`/channels/${activeId}/join`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
    onError: () => toast.error('Could not join'),
  });

  // ── Effects ───────────────────────────────────────────────────────
  // Only auto-scroll when the user is already near the bottom
  useEffect(() => {
    if (nearBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, brainThinking, nearBottom]);
  // Jump to bottom instantly when switching channels + capture unread marker
  useEffect(() => {
    setNearBottom(true);
    setUnreadMarker(active?.unread_count ?? 0);
    messagesEndRef.current?.scrollIntoView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
  };
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [input]);
  // Auto-select first channel; also bounce off stale/foreign channel ids
  useEffect(() => {
    if (!activeId && channelList.length > 0) navigate(`/channels/${channelList[0].id}`, { replace: true });
    else if (activeId && channelList.length > 0 && !channels.some((c) => c.id === activeId)) {
      navigate(`/channels/${channelList[0].id}`, { replace: true });
    }
  }, [activeId, channelList, channels, navigate]);

  // ── Mention picker logic ──────────────────────────────────────────
  const updateMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at >= 0 && (at === 0 || /\s/.test(before[at - 1]))) {
      const token = before.slice(at + 1);
      if (/^[\w]*$/.test(token)) {
        setMentionStart(at); setMentionQuery(token); setMentionOpen(true); setMentionIdx(0);
        return;
      }
    }
    setMentionOpen(false);
  };

  const filteredMembers = (members ?? []).filter((m) =>
    m.id !== user?.id &&
    (m.handle.toLowerCase().startsWith(mentionQuery.toLowerCase()) ||
     m.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
     (m.email && m.email.toLowerCase().includes(mentionQuery.toLowerCase())))
  );
  // Virtual @all option — tags everyone in the workspace (Brain excluded)
  const allEntry: Member = { id: 'all', name: 'Everyone', handle: 'all', is_bot: false };
  const allOption: Member[] =
    'all'.startsWith(mentionQuery.toLowerCase()) || 'everyone'.includes(mentionQuery.toLowerCase())
      ? [allEntry]
      : [];
  const pickerOptions = [...allOption, ...filteredMembers];

  const pickMention = (m: Member) => {
    const caret = textareaRef.current?.selectionStart ?? input.length;
    setInput(`${input.slice(0, mentionStart)}@${m.handle} ${input.slice(caret)}`);
    setMentionOpen(false);
    textareaRef.current?.focus();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    pingTyping();
    updateMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && pickerOptions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => (i + 1) % pickerOptions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((i) => (i - 1 + pickerOptions.length) % pickerOptions.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(pickerOptions[mentionIdx]); return; }
      if (e.key === 'Escape') { setMentionOpen(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const content = input.trim();
    if (!content || sendMutation.isPending || !activeId) return;
    setInput(''); setMentionOpen(false);
    sendMutation.mutate(content);
  };

  const visible = (messages ?? []).filter((m) => m.role !== 'tool');
  const canPost = !!active && (active.kind === 'dm' || active.visibility === 'public' || active.is_member);

  return (
    <div className="flex flex-1 h-full">
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        {active && (
          <div className="flex items-center gap-2.5 px-4 h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex-shrink-0">
            {active.kind === 'dm'
              ? <MessageSquare className="h-4 w-4 text-gray-400" />
              : active.visibility === 'private'
                ? <Lock className="h-4 w-4 text-gray-400" />
                : <Hash className="h-4 w-4 text-gray-400" />}
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {active.kind === 'dm' ? (active.peer_name ?? 'Direct message') : active.name}
            </h2>
            {active.kind === 'dm' && active.peer_id && onlineIds.has(active.peer_id) && (
              <span className="flex items-center gap-1 text-[10px] text-green-500 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Online
              </span>
            )}
            {active.kind !== 'dm' && (
              <span className="flex items-center gap-1 text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-0.5">
                <Users className="h-3 w-3" />{active.member_count}
              </span>
            )}
            {active.kind === 'channel' && active.visibility === 'public' && !active.is_member && (
              <Button size="sm" className="ml-auto" onClick={() => joinMutation.mutate()} loading={joinMutation.isPending}>Join channel</Button>
            )}
            {active.kind === 'dm' && (
              <span className="text-[10px] text-gray-400 ml-auto">Tag @brain to get an AI reply</span>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0d0d0f]" ref={scrollRef} onScroll={handleScroll}>
          {!activeId ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">Pick a channel</div>
          ) : isLoading ? (
            <div className="p-6 space-y-4"><SkeletonText lines={3} /><SkeletonText lines={2} /></div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-4 animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                {active?.kind === 'dm'
                  ? <MessageSquare className="h-7 w-7 text-indigo-400" />
                  : <Hash className="h-7 w-7 text-indigo-400" />}
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {active?.kind === 'dm' ? `This is the start of your conversation` : `Welcome to #${active?.name ?? 'channel'}`}
              </p>
              <p className="text-xs text-gray-400">Type @ to mention someone · @brain to ask the AI</p>
            </div>
          ) : (
            <div className="py-4">
              {visible.map((msg, idx) => {
                const prev = visible[idx - 1];
                const isBrainMsg = msg.role === 'assistant';
                const mine = msg.user_id === user?.id;
                const dayChanged = !prev || !sameDay(msg.created_at, prev.created_at);
                const sameAuthor = !dayChanged && prev.role === msg.role
                  && (msg.role === 'assistant' ? true : prev.user_id === msg.user_id)
                  && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000);

                const isUnreadBoundary = unreadMarker > 0 && idx === visible.length - unreadMarker;
                const isLive = new Date(msg.created_at).getTime() > mountAt.current;

                return (
                  <div key={msg.id} className={isLive ? 'animate-slide-up' : undefined}>
                    {dayChanged && (
                      <div className="flex items-center justify-center pt-4 pb-1">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-100 dark:bg-white/10 dark:text-gray-300 rounded-full px-3 py-1">
                          {dayLabel(msg.created_at)}
                        </span>
                      </div>
                    )}
                    {isUnreadBoundary && (
                      <div className="flex items-center gap-3 px-4 py-2">
                        <div className="flex-1 h-px bg-red-400/60" />
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">New</span>
                        <div className="flex-1 h-px bg-red-400/60" />
                      </div>
                    )}

                    {sameAuthor ? (
                      // Compact continuation row — timestamp shows on hover
                      <div className="group relative flex gap-3 px-4 py-0.5 hover:bg-gray-50/80 dark:hover:bg-white/[0.03] transition-colors">
                        <span className="w-7 flex-shrink-0 text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 mt-1.5 text-center leading-none">
                          {timeLabel(msg.created_at)}
                        </span>
                        <div className="flex-1 min-w-0">
                          {isBrainMsg ? <BrainMarkdown content={msg.content} /> : <MessageText content={msg.content} meHandle={meHandle} />}
                          <ReactionPills msg={msg} onReact={onReact} />
                        </div>
                        <HoverActions msg={msg} mine={mine} copiedId={copiedId} onCopy={copyMessage} onReact={onReact} onDelete={(id) => deleteMutation.mutate(id)} />
                      </div>
                    ) : (
                      // First message of a group — avatar + author + time
                      <div className={cn(
                        'group relative flex gap-3 px-4 pt-2.5 pb-0.5 hover:bg-gray-50/80 dark:hover:bg-white/[0.03] transition-colors',
                        mine && 'bg-indigo-500/[0.06] border-l-2 border-indigo-500/50',
                        isBrainMsg && 'bg-indigo-500/[0.04]'
                      )}>
                        <Avatar name={msg.author_name ?? '?'} isBrain={isBrainMsg} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                              {isBrainMsg ? 'Brain' : msg.author_name ?? 'Unknown'}
                              {mine && <span className="ml-1 text-[10px] font-normal text-gray-400">(you)</span>}
                            </span>
                            <span className="text-[10px] text-gray-400">{timeLabel(msg.created_at)}</span>
                          </div>
                          {isBrainMsg ? <BrainMarkdown content={msg.content} /> : <MessageText content={msg.content} meHandle={meHandle} />}
                          <ReactionPills msg={msg} onReact={onReact} />
                        </div>
                        <HoverActions msg={msg} mine={mine} copiedId={copiedId} onCopy={copyMessage} onReact={onReact} onDelete={(id) => deleteMutation.mutate(id)} />
                      </div>
                    )}
                  </div>
                );
              })}
              {brainThinking && (
                <div className="flex gap-3 px-4 py-2.5">
                  <Avatar name="Brain" isBrain />
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="text-[11px] text-gray-400 ml-1">Brain is thinking…</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        {activeId && canPost && (
          <div className="border-t border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 p-4">
            {(typingNames ?? []).length > 0 && (
              <div className="flex items-center gap-1.5 mb-1.5 animate-fade-in">
                <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                <p className="text-[11px] text-gray-400 ml-1">
                  {typingNames!.join(', ')} {typingNames!.length === 1 ? 'is' : 'are'} typing…
                </p>
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex gap-2 items-end">
              <div className="relative flex-1">
                {mentionOpen && pickerOptions.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-10 animate-pop-in">
                    {pickerOptions.map((m, i) => (
                      <button
                        key={m.id} type="button"
                        onMouseDown={(e) => { e.preventDefault(); pickMention(m); }}
                        className={cn('w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                          i === mentionIdx ? 'bg-indigo-100 dark:bg-indigo-800' : 'hover:bg-gray-100 dark:hover:bg-gray-800')}
                      >
                        <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0',
                          m.is_bot ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300')}>
                          {m.is_bot ? <Brain className="h-3 w-3" /> : m.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="flex-1 truncate text-gray-900 dark:text-gray-100">{m.name}</span>
                        <span className="text-xs text-gray-400">@{m.handle}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${active?.kind === 'dm' ? active.peer_name ?? 'DM' : `#${active?.name ?? ''}`}… (@ to mention, @brain for AI)`}
                    disabled={sendMutation.isPending}
                    rows={1}
                    className="w-full px-4 py-3 text-sm bg-transparent resize-none outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 disabled:opacity-50"
                  />
                </div>
              </div>
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || sendMutation.isPending}
                loading={sendMutation.isPending}
                title="Send (Enter)"
                className="active:scale-90 transition-transform"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <p className="text-xs text-gray-400 mt-1.5 text-center">Messages without @brain are just stored — no AI call</p>
          </div>
        )}
      </div>

    </div>
  );
}
