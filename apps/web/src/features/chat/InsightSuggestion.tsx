import { useState } from 'react';
import { Sparkles, BookOpen, X, Check, Tag, ChevronDown } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn, getErrorMessage } from '@/lib/utils';
import type { LearnedInsight } from '@/types';
import toast from 'react-hot-toast';

interface InsightSuggestionProps {
  insight: LearnedInsight;
  onDismiss: () => void;
}

const CATEGORY_OPTIONS = [
  { value: 'fact', label: '📌 Fact' },
  { value: 'document', label: '📄 Document' },
  { value: 'procedure', label: '📋 Procedure' },
  { value: 'note', label: '📝 Note' },
] as const;

type CategoryType = 'fact' | 'document' | 'procedure' | 'note';

const TYPE_COLOR: Record<CategoryType, string> = {
  fact: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60',
  document: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/60',
  procedure: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60',
  note: 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/60',
};

export function InsightSuggestion({ insight, onDismiss }: InsightSuggestionProps) {
  const qc = useQueryClient();
  const [selectedType, setSelectedType] = useState<CategoryType>(
    (CATEGORY_OPTIONS.some((o) => o.value === insight.type) ? insight.type : 'fact') as CategoryType
  );
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post('/knowledge', {
        title: insight.title,
        content: insight.content,
        type: selectedType,
        tags: insight.tags,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setSaved(true);
      toast.success(`Saved to knowledge base as ${selectedType}`);
      setTimeout(onDismiss, 1500);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className={cn(
      'mx-4 mt-1 mb-3 rounded-xl border p-3.5 animate-slide-up shadow-sm transition-all',
      TYPE_COLOR[selectedType]
    )}>
      <div className="flex items-start gap-2.5">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <Sparkles className="h-4 w-4 text-brand-500 animate-pulse" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
              💡 Save summary to Knowledge Base? Choose category:
            </p>
            <div className="relative inline-flex items-center">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as CategoryType)}
                className="text-xs font-medium pl-2.5 pr-7 py-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1a1d24] text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer appearance-none transition-colors"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-white dark:bg-[#1a1d24] text-gray-900 dark:text-gray-100">
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-3 w-3 text-gray-400 absolute right-2 pointer-events-none" />
            </div>
          </div>

          <p className="text-xs font-medium text-gray-900 dark:text-gray-100 mb-0.5">
            {insight.title}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
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
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          {saved ? (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium px-2.5 py-1.5">
              <Check className="h-3.5 w-3.5" /> Saved!
            </span>
          ) : (
            <>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className={cn(
                  'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shadow-sm',
                  'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50'
                )}
              >
                <BookOpen className="h-3.5 w-3.5" />
                {saveMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={onDismiss}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
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
