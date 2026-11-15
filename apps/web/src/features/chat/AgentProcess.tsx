import { useState, useEffect } from 'react';
import { Wrench, ChevronDown, ChevronUp, Check, AlertCircle, Loader2, Brain } from 'lucide-react';
import type { Message } from '@/types';

interface ToolCallRef {
  id: string;
  function: { name: string; arguments: string };
}

/** Summarize a tool's args for display: `query_connected_data("SELECT …")` */
function argsFor(steps: Message[], toolCallId?: string): string | null {
  if (!toolCallId) return null;
  for (const s of steps) {
    const calls = s.tool_calls as ToolCallRef[] | undefined;
    const hit = calls?.find((c) => c.id === toolCallId);
    if (hit) {
      try {
        const parsed = JSON.parse(hit.function.arguments) as Record<string, unknown>;
        const vals = Object.values(parsed).map((v) =>
          typeof v === 'string' ? `"${v.length > 60 ? `${v.slice(0, 60)}…` : v}"` : JSON.stringify(v)
        );
        return `(${vals.join(', ')})`;
      } catch {
        return hit.function.arguments.slice(0, 80);
      }
    }
  }
  return null;
}

/** Short human-readable summary of a tool result. */
function resultPreview(content: string): string {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed.error) return `Error: ${String(parsed.error)}`.slice(0, 120);
    if (Array.isArray(parsed.rows)) return `${parsed.rows.length} rows returned`;
    if (parsed.artifact_type) return `${String(parsed.artifact_type)} generated`;
    const str = JSON.stringify(parsed);
    return str.length > 110 ? `${str.slice(0, 110)}…` : str;
  } catch {
    return content.length > 110 ? `${content.slice(0, 110)}…` : content;
  }
}

/** PromptQL-style collapsible process panel — live while the agent works. */
export function AgentProcess({ steps, live }: { steps: Message[]; live: boolean }) {
  const [open, setOpen] = useState(live);
  useEffect(() => { if (live) setOpen(true); }, [live]);

  const toolSteps = steps.filter((s) => s.role === 'tool');
  const done = toolSteps.filter((s) => (s.metadata as { success?: boolean } | undefined)?.success !== false).length;
  const failed = toolSteps.length - done;

  return (
    <div className="mx-4 my-1.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03] overflow-hidden animate-fade-in">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
      >
        {live
          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
          : <Brain className="h-3.5 w-3.5 text-indigo-400" />}
        <span className="font-medium">
          {live ? 'Brain is working…' : `Process · ${toolSteps.length} ${toolSteps.length === 1 ? 'step' : 'steps'}${failed > 0 ? ` · ${failed} failed` : ''}`}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-gray-400">
          {open ? 'Hide' : 'Show'} {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-200 dark:border-white/5">
          {toolSteps.length === 0 && (
            <p className="px-3 py-2.5 text-[11px] text-gray-500 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" /> Thinking…
            </p>
          )}
          {toolSteps.map((s, i) => {
            const ok = (s.metadata as { success?: boolean } | undefined)?.success !== false;
            const args = argsFor(steps, s.tool_call_id);
            return (
              <div
                key={s.id}
                className="flex items-start gap-2.5 px-3 py-2 border-b border-gray-100 dark:border-white/5 last:border-0 animate-slide-up"
              >
                <span className="w-4 h-4 mt-0.5 flex items-center justify-center text-[9px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-500/15 rounded-full flex-shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Wrench className="h-3 w-3 text-gray-400 flex-shrink-0" />
                    <span className="text-xs font-medium font-mono text-gray-700 dark:text-gray-300 truncate">
                      {s.tool_name}
                      {args && <span className="text-gray-400 font-normal">{args}</span>}
                    </span>
                    {ok
                      ? <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
                      : <AlertCircle className="h-3 w-3 text-red-400 flex-shrink-0" />}
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">{resultPreview(s.content)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
