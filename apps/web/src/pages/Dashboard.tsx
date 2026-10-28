import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Bot, Database, BookOpen, FileText, ListTodo, Plus, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { timeAgo, truncate } from '@/lib/utils';
import type { DashboardData } from '@/types';

const STATUS_VARIANT = {
  completed: 'success',
  running: 'info',
  queued: 'warning',
  failed: 'danger',
  cancelled: 'default',
} as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then((r) => r.data.data as DashboardData),
    refetchInterval: 30_000,
  });

  const stats = data?.stats ?? { active_agents: 0, connected_sources: 0, knowledge_documents: 0, messages_this_month: 0 };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={`Good ${getGreeting()}, ${user?.name?.split(' ')[0] ?? 'there'}`}
        description="Here's what's happening in your workspace"
        actions={
          <Button onClick={() => navigate('/chat')} size="sm">
            <Plus className="h-4 w-4" /> New chat
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Active Agents', value: stats.active_agents, icon: Bot, color: 'text-purple-500', href: '/agents' },
            { label: 'Connected Sources', value: stats.connected_sources, icon: Database, color: 'text-blue-500', href: '/data-sources' },
            { label: 'Knowledge Docs', value: stats.knowledge_documents, icon: BookOpen, color: 'text-green-500', href: '/knowledge' },
            { label: 'Messages This Month', value: stats.messages_this_month, icon: TrendingUp, color: 'text-brand-500', href: '/chat' },
          ].map((stat) => (
            <Card key={stat.label} onClick={() => navigate(stat.href)} className="cursor-pointer">
              <CardBody className="flex items-center gap-3 py-4">
                <div className="rounded-xl bg-gray-100 dark:bg-gray-800 p-2.5">
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{isLoading ? '—' : stat.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Conversations */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Conversations</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/chat')}>View all</Button>
            </div>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
            ) : data?.recent_conversations?.length ? (
              <div className="space-y-2">
                {data.recent_conversations.map((conv) => (
                  <Card key={conv.id} onClick={() => navigate(`/chat/${conv.id}`)}>
                    <CardBody className="flex items-center gap-3 py-3">
                      <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{truncate(conv.title, 50)}</p>
                        <p className="text-xs text-gray-400">{conv.message_count} messages · {timeAgo(conv.updated_at)}</p>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
                <MessageSquare className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No conversations yet</p>
                <Button size="sm" className="mt-3" onClick={() => navigate('/chat')}>Start chatting</Button>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Recent Tasks */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Tasks</h2>
                <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>View all</Button>
              </div>
              {isLoading ? <SkeletonCard /> : data?.recent_tasks?.length ? (
                <div className="space-y-2">
                  {data.recent_tasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <ListTodo className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[120px]">{task.type}</span>
                      </div>
                      <Badge variant={STATUS_VARIANT[task.status] ?? 'default'}>
                        {task.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 px-1">No tasks yet</p>
              )}
            </div>

            {/* Recent Artifacts */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Artifacts</h2>
                <Button variant="ghost" size="sm" onClick={() => navigate('/artifacts')}>View all</Button>
              </div>
              {isLoading ? <SkeletonCard /> : data?.recent_artifacts?.length ? (
                <div className="space-y-2">
                  {data.recent_artifacts.map((artifact) => (
                    <div key={artifact.id} className="flex items-center gap-2 rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2.5">
                      <FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{artifact.name}</span>
                      <Badge variant="default" className="ml-auto flex-shrink-0">{artifact.type}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 px-1">No artifacts yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}
