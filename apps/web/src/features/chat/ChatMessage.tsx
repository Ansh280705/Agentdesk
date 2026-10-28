import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThumbsUp, ThumbsDown, Copy, Check, Wrench, AlertCircle } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { ChartRenderer } from './ChartRenderer';
import type { Message } from '@/types';
import toast from 'react-hot-toast';

interface ChatMessageProps {
  message: Message;
  conversationId: string;
  onFeedback?: (msgId: string, feedback: 'up' | 'down') => void;
}

export function ChatMessage({ message, conversationId, onFeedback }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(message.feedback ?? null);

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

  // Parse chart data embedded in assistant messages
  const chartData = tryParseChart(message.content);

  if (isTool) {
    return (
      <div className="flex items-start gap-2 py-1 px-4">
        <Wrench className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-gray-400 dark:text-gray-500">
          <span className="font-medium text-gray-500 dark:text-gray-400">{message.tool_name}</span>
          {' '}completed
        </div>
      </div>
    );
  }

  return (
    <div className={cn('group flex gap-3 px-4 py-3 animate-slide-up', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5',
        isUser
          ? 'bg-brand-600 text-white'
          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
      )}>
        {isUser ? 'U' : 'A'}
      </div>

      {/* Content */}
      <div className={cn('flex-1 min-w-0', isUser && 'flex flex-col items-end')}>
        <div className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
          isUser
            ? 'bg-brand-600 text-white rounded-tr-sm'
            : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-tl-sm'
        )}>
          {isAssistant ? (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-code:text-brand-600 dark:prose-code:text-brand-400">
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

        {/* Metadata */}
        {message.metadata?.demo && (
          <div className="flex items-center gap-1 mt-1 text-xs text-amber-500">
            <AlertCircle className="h-3 w-3" /> Demo mode — configure GROQ_API_KEY for real AI
          </div>
        )}

        {/* Actions for assistant */}
        {isAssistant && (
          <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-xs text-gray-400 mr-1">{timeAgo(message.created_at)}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} aria-label="Copy">
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
            <Button
              variant="ghost" size="icon" className={cn('h-6 w-6', feedback === 'up' && 'text-green-500')}
              onClick={() => handleFeedback('up')} aria-label="Thumbs up"
            >
              <ThumbsUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost" size="icon" className={cn('h-6 w-6', feedback === 'down' && 'text-red-500')}
              onClick={() => handleFeedback('down')} aria-label="Thumbs down"
            >
              <ThumbsDown className="h-3 w-3" />
            </Button>
          </div>
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
