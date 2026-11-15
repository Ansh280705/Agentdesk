import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, StopCircle, Bot, MessageSquare, Brain, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { ChatMessage } from '@/features/chat/ChatMessage';
import { AgentStatusBar } from '@/features/chat/AgentStatusBar';
import { AgentProcess } from '@/features/chat/AgentProcess';
import { InsightSuggestion } from '@/features/chat/InsightSuggestion';
import { SkeletonText } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import type { Message, Conversation, LearnedInsight, Agent } from '@/types';
import toast from 'react-hot-toast';

const BRAIN_TAG = /\b@brain\b/i;

export default function ChatPage() {
  const { id: conversationId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  // @mention autocomplete state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionIdx, setMentionIdx] = useState(0);
  // Pending insight to show after last AI response
  const [pendingInsight, setPendingInsight] = useState<LearnedInsight | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load conversation
  const { data: convData } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => conversationId
      ? api.get(`/conversations/${conversationId}`).then((r) => r.data.data as Conversation)
      : Promise.resolve(null),
    enabled: !!conversationId,
  });

  // Conversation bound to a specific agent replies to every message
  const boundAgentId = convData?.agent_id;
  const { data: boundAgent } = useQuery({
    queryKey: ['agent', boundAgentId],
    queryFn: () => api.get(`/agents/${boundAgentId}`).then((r) => r.data.data as Agent),
    enabled: !!boundAgentId,
  });

  // Load messages — poll while the agent is working so steps stream in live
  const { data: messagesData, isLoading: msgsLoading } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => conversationId
      ? api.get(`/conversations/${conversationId}/messages?per_page=100`).then((r) => r.data.data as Message[])
      : Promise.resolve([]),
    enabled: !!conversationId,
    refetchInterval: agentStatus ? 1200 : false,
  });

  // Workspace members for @mentions (includes Brain bot)
  const { data: members } = useQuery({
    queryKey: ['channel-users'],
    queryFn: () => api.get('/channels/users').then((r) => r.data.data as Array<{ id: string; name: string; handle: string; is_bot: boolean }>),
  });

  const filteredMembers = (members ?? []).filter((m) =>
    m.handle.toLowerCase().startsWith(mentionQuery.toLowerCase()) ||
    m.name.toLowerCase().includes(mentionQuery.toLowerCase())
  ).slice(0, 8);

  const updateMention = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at !== -1 && (at === 0 || /\s/.test(before[at - 1]))) {
      const q = before.slice(at + 1);
      if (!/\s/.test(q)) {
        setMentionOpen(true);
        setMentionQuery(q);
        setMentionStart(at);
        setMentionIdx(0);
        return;
      }
    }
    setMentionOpen(false);
  };

  const pickMention = (m: { handle: string }) => {
    const caret = textareaRef.current?.selectionStart ?? input.length;
    setInput(`${input.slice(0, mentionStart)}@${m.handle} ${input.slice(caret)}`);
    setMentionOpen(false);
    textareaRef.current?.focus();
  };

  const messages = messagesData ?? [];

  // Group consecutive tool-call records + empty assistant turns into process runs.
  // Also remember the user question that preceded each assistant answer (for "Save to Wiki").
  const renderItems: Array<{ type: 'msg'; m: Message; promptText?: string } | { type: 'steps'; items: Message[] }> = [];
  let lastUserContent = '';
  for (const m of messages) {
    const isStep = m.role === 'tool' || (m.role === 'assistant' && !(m.content ?? '').trim());
    if (m.role === 'user') lastUserContent = m.content;
    if (isStep) {
      const last = renderItems[renderItems.length - 1];
      if (last?.type === 'steps') last.items.push(m);
      else renderItems.push({ type: 'steps', items: [m] });
    } else {
      renderItems.push({ type: 'msg', m, promptText: m.role === 'assistant' ? lastUserContent : undefined });
    }
  }

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (payload: { content: string; respond: boolean }) => {
      if (payload.respond) setAgentStatus('understanding');
      const res = await api.post(`/conversations/${conversationId}/messages`, payload);
      return res.data.data as {
        messageId: string;
        content: string;
        toolCallCount: number;
        status: string;
        learnedInsight?: LearnedInsight | null;
      };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setAgentStatus(null);

      // Show insight suggestion if AI extracted something useful
      if (result.learnedInsight) {
        setPendingInsight(result.learnedInsight);
      } else {
        setPendingInsight(null);
      }
    },
    onError: (err: unknown) => {
      setAgentStatus(null);
      setPendingInsight(null);
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to send message';
      toast.error(msg);
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentStatus, pendingInsight]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const content = input.trim();
    if (!content || sendMutation.isPending) return;

    // Clear previous insight when user sends a new message
    setPendingInsight(null);

    if (!conversationId) {
      // Create conversation first
      try {
        const res = await api.post('/conversations', { title: content.slice(0, 80) });
        const newId = res.data.data.id;
        qc.invalidateQueries({ queryKey: ['conversations'] });
        navigate(`/chat/${newId}`);
        setInput('');
        sessionStorage.setItem('pending_message', JSON.stringify({ content, respond: BRAIN_TAG.test(content) }));
      } catch {
        toast.error('Failed to create conversation');
      }
      return;
    }

    setInput('');
    sendMutation.mutate({ content, respond: !!boundAgentId || BRAIN_TAG.test(content) });
  };

  // Handle pending message after navigation
  useEffect(() => {
    if (conversationId) {
      const pending = sessionStorage.getItem('pending_message');
      if (pending) {
        sessionStorage.removeItem('pending_message');
        let payload: { content: string; respond: boolean };
        try {
          const parsed = JSON.parse(pending);
          payload = typeof parsed === 'string' ? { content: parsed, respond: true } : parsed;
        } catch {
          payload = { content: pending, respond: true };
        }
        setTimeout(() => sendMutation.mutate(payload), 100);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

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

  const isLoading = sendMutation.isPending;

  // Poll the engine's live status so the bar shows the actual current step
  const { data: liveStatus } = useQuery({
    queryKey: ['agent-status', conversationId],
    queryFn: () => api.get(`/conversations/${conversationId}/status`).then((r) => r.data.data as { status: string; detail?: string } | null),
    enabled: !!conversationId && isLoading,
    refetchInterval: 800,
  });

  return (
    <div className="flex flex-col flex-1 h-full">
        {/* Header */}
        {convData && (
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950">
            <MessageSquare className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{convData.title}</h2>
            {boundAgent && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                <Sparkles className="h-3 w-3" /> Agent: {boundAgent.name}
              </span>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0d0d0f]">
          {!conversationId ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                <Bot className="h-6 w-6 text-brand-600 dark:text-brand-400" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">How can I help you today?</h2>
                <p className="text-sm text-gray-500 mt-1">Start a new conversation with your AI coworker</p>
              </div>
              <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                    className="text-left text-xs px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-brand-400 dark:hover:border-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/50 transition-colors text-gray-600 dark:text-gray-400"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : msgsLoading ? (
            <div className="p-6 space-y-4">
              <SkeletonText lines={3} />
              <SkeletonText lines={2} />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <p className="text-sm text-gray-500">Send a message to start</p>
            </div>
          ) : (
            <div className="py-4 space-y-1">
              {renderItems.map((item, i) =>
                item.type === 'steps' ? (
                  <AgentProcess
                    key={`steps-${i}`}
                    steps={item.items}
                    live={isLoading && i === renderItems.length - 1}
                  />
                ) : (
                  <ChatMessage
                    key={item.m.id}
                    message={item.m}
                    conversationId={conversationId!}
                    promptText={item.promptText}
                  />
                )
              )}

              {/* Insight suggestion — shown at bottom after last response */}
              {pendingInsight && !isLoading && (
                <InsightSuggestion
                  insight={pendingInsight}
                  onDismiss={() => setPendingInsight(null)}
                />
              )}

              {isLoading && <AgentStatusBar status={liveStatus?.status ?? agentStatus ?? 'understanding'} detail={liveStatus?.detail} />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 p-4">
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <div className="relative flex-1">
              {mentionOpen && filteredMembers.length > 0 && (
                <div className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-800 shadow-lg z-10 animate-pop-in">
                  {filteredMembers.map((m, i) => (
                    <button
                      key={m.id} type="button"
                      onMouseDown={(e) => { e.preventDefault(); pickMention(m); }}
                      className={cn('w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                        i === mentionIdx ? 'bg-indigo-100 dark:bg-indigo-800' : 'hover:bg-gray-100 dark:hover:bg-gray-800')}
                    >
                      <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0',
                        m.is_bot ? 'bg-gradient-to-br from-brand-400 to-brand-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300')}>
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
                  onChange={(e) => { setInput(e.target.value); updateMention(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
                  onKeyDown={handleKeyDown}
                  placeholder={boundAgent ? `Message ${boundAgent.name}…` : 'Message your AI coworker… (type @brain to ask the AI)'}
                disabled={isLoading}
                rows={1}
                className={cn(
                  'w-full px-4 py-3 text-sm bg-transparent resize-none outline-none',
                  'text-gray-900 dark:text-gray-100 placeholder:text-gray-400',
                  'disabled:opacity-50'
                )}
              />
            </div>
            </div>
            {isLoading ? (
              <Button type="button" variant="secondary" size="icon" onClick={() => sendMutation.reset()} title="Stop" className="active:scale-90 transition-transform">
                <StopCircle className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()} title="Send (Enter)" className="active:scale-90 transition-transform">
                <Send className="h-4 w-4" />
              </Button>
            )}
          </form>
          <p className="text-xs text-gray-400 mt-1.5 text-center">AI can make mistakes — verify important information</p>
        </div>
    </div>
  );
}

const STARTER_PROMPTS = [
  'What can you help me with?',
  'Analyze some data for me',
  'Create a summary report',
  'Help me plan a project',
];
