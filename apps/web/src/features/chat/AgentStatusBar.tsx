import { cn } from '@/lib/utils';
import { Brain, Search, Wrench, CheckCircle, AlertCircle, Loader2, Lightbulb, Cpu } from 'lucide-react';

interface AgentStatusBarProps {
  status: string;
  detail?: string;
}

const STATUS_CONFIG = {
  understanding: { icon: Brain, label: 'Understanding request', color: 'text-purple-500' },
  planning: { icon: Lightbulb, label: 'Planning approach', color: 'text-blue-500' },
  retrieving: { icon: Search, label: 'Retrieving information', color: 'text-brand-500' },
  tool_calling: { icon: Wrench, label: 'Running tool', color: 'text-amber-500' },
  checking: { icon: CheckCircle, label: 'Checking results', color: 'text-green-500' },
  generating: { icon: Cpu, label: 'Generating response', color: 'text-brand-600' },
  failed: { icon: AlertCircle, label: 'Something went wrong', color: 'text-red-500' },
};

export function AgentStatusBar({ status, detail }: AgentStatusBarProps) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
  if (!cfg) return null;

  const Icon = cfg.icon;

  return (
    <div className="flex items-center gap-2 px-4 py-2 mx-4 mb-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 animate-fade-in">
      <Loader2 className={cn('h-3.5 w-3.5 animate-spin', cfg.color)} />
      <Icon className={cn('h-3.5 w-3.5', cfg.color)} />
      <span className="text-xs text-gray-600 dark:text-gray-400">
        {cfg.label}
        {detail && <span className="text-gray-400 dark:text-gray-500"> — {detail}</span>}
      </span>
    </div>
  );
}
