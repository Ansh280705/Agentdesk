import { Brain, Search, Wrench, CheckCircle, AlertCircle, Lightbulb, Cpu } from 'lucide-react';

interface AgentStatusBarProps {
  status: string;
  detail?: string;
}

const STATUS_CONFIG = {
  understanding: { icon: Brain, label: 'Understanding your request' },
  planning: { icon: Lightbulb, label: 'Planning the approach' },
  retrieving: { icon: Search, label: 'Retrieving information' },
  tool_calling: { icon: Wrench, label: 'Running a tool' },
  checking: { icon: CheckCircle, label: 'Checking results' },
  generating: { icon: Cpu, label: 'Generating response' },
  failed: { icon: AlertCircle, label: 'Something went wrong' },
};

/** In-list "Brain is working" row — same layout as a message, animated. */
export function AgentStatusBar({ status, detail }: AgentStatusBarProps) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.understanding;
  const Icon = cfg.icon;

  return (
    <div className="flex gap-3 px-4 py-2.5 animate-fade-in">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-sm">
        <Brain className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">Brain</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          <span className="text-[11px] text-gray-400 ml-1 flex items-center gap-1">
            <Icon className="h-3 w-3" />
            {cfg.label}
            {detail && <span className="text-gray-400/70">— {detail}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}
