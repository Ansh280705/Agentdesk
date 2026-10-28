import { useState } from 'react';
import { Sparkles, BookOpen, X, Check, Tag } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn, getErrorMessage } from '@/lib/utils';
import type { LearnedInsight } from '@/types';
import toast from 'react-hot-toast';

interface InsightSuggestionProps {
  insight: LearnedInsight;
  onDismiss: () => void;
}

const TYPE_LABEL = {
  fact: 'Fact',
  note: 'Note',
  procedure: 'Procedure',
};

const TYPE_COLOR = {
  fact: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  note: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  procedure: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
};

export function InsightSuggestion({ insight, onDismiss }: InsightSuggestionProps) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post('/knowledge', {
        title: insight.title,
        content: insight.content,
        type: insight.type,
        tags: insight.tags,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setSaved(true);
      toast.success('Saved to knowledge base');
      setTimeout(onDismiss, 1500);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className={cn(
      'mx-4 mt-1 mb-3 rounded-xl border p-3 animate-slide-up',
      TYPE_COLOR[insight.type]
    )}>
      <div className="flex items-start gap-2">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <Sparkles className="h-4 w-4 text-brand-500" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              💡 AgentDesk learned something — save to knowledge?
            </p>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-black/20 text-gray-500 dark:text-gray-400 font-medium border border-current/10">
              {TYPE_LABEL[insight.type]}
            </span>
          </div>

          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 mb-0.5">
            {insight.title}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
            {insight.content}
          </p>

          {insight.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              <Tag className="h-2.5 w-2.5 text-gray-400 flex-shrink-0" />
              {insight.tags.map((tag) => (
                <span key={tag} className="text-xs text-gray-400">#{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {saved ? (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium px-2 py-1">
              <Check className="h-3.5 w-3.5" /> Saved!
            </span>
          ) : (
            <>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className={cn(
                  'flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors',
                  'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50'
                )}
              >
                <BookOpen className="h-3 w-3" />
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={onDismiss}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-black/20 transition-colors"
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
