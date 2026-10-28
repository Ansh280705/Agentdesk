import { useState, useRef, useEffect, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, StopCircle, Bot, MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { ChatMessage } from '@/features/chat/ChatMessage';
import { AgentStatusBar } from '@/features/chat/AgentStatusBar';
import { InsightSuggestion } from '@/features/chat/InsightSuggestion';
import { SkeletonText } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import type { Message, Conversation, LearnedInsight } from '@/types';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const { id: conversationId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
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

  // Load messages
  const { data: messagesData, isLoading: msgsLoading } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => conversationId
      ? api.get(`/conversations/${conversationId}/messages?per_page=100`).then((r) => r.data.data as Message[])
      : Promise.resolve([]),
    enabled: !!conversationId,
  });

  const messages = messagesData ?? [];

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      setAgentStatus('understanding');
      const res = await api.post(`/conversations/${conversationId}/messages`, { content });
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
        sessionStorage.setItem('pending_message', content);
      } catch {
        toast.error('Failed to create conversation');
      }
      return;
    }

    setInput('');
    sendMutation.mutate(content);
  };

  // Handle pending message after navigation
  useEffect(() => {
    if (conversationId) {
      const pending = sessionStorage.getItem('pending_message');
      if (pending) {
        sessionStorage.removeItem('pending_message');
        setTimeout(() => sendMutation.mutate(pending), 100);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isLoading = sendMutation.isPending;

  return (
    <div className="flex flex-col flex-1 h-full">
        {/* Header */}
        {convData && (
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
            <MessageSquare className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{convData.title}</h2>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
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
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  conversationId={conversationId!}
                />
              ))}

              {/* Insight suggestion — shown at bottom after last response */}
              {pendingInsight && !isLoading && (
                <InsightSuggestion
                  insight={pendingInsight}
                  onDismiss={() => setPendingInsight(null)}
                />
              )}

              {isLoading && agentStatus && (
                <AgentStatusBar status={agentStatus} />
              )}
              {isLoading && !agentStatus && (
                <div className="flex gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs">A</div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
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
            <div className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message your AI coworker… (Enter to send, Shift+Enter for newline)"
                disabled={isLoading}
                rows={1}
                className={cn(
                  'w-full px-4 py-3 text-sm bg-transparent resize-none outline-none',
                  'text-gray-900 dark:text-gray-100 placeholder:text-gray-400',
                  'disabled:opacity-50'
                )}
              />
            </div>
            {isLoading ? (
              <Button type="button" variant="secondary" size="icon" onClick={() => sendMutation.reset()} title="Stop">
                <StopCircle className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()} title="Send (Enter)">
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
