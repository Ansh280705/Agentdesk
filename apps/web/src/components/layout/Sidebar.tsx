import { useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare, Bot, Database, BookOpen,
  FileText, ListTodo, Settings, LogOut,
  Plus, Pencil, Check, X, Trash2, Clock, Users,
  Hash, Lock, AtSign, UserPlus,
} from 'lucide-react';
import { cn, truncate, timeAgo } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api';
import type { Conversation } from '@/types';
import toast from 'react-hot-toast';

interface Channel {
  id: string; name: string; kind: 'channel' | 'dm'; visibility: 'public' | 'private';
  is_member: boolean; member_count: number; unread_count: number;
  peer_name?: string; peer_id?: string;
}
interface WorkspaceUser { id: string; name: string; handle: string; is_bot: boolean }
interface MentionRow {
  mention_id: string; channel_id: string; content: string;
  author_name: string; channel_name: string; channel_kind: string; created_at: string;
}

// Navigation sections — PromptQL style: workspace tools grouped below conversations
const NAV_SECTIONS = [
  {
    label: 'Workspace',
    items: [
      { to: '/channels', icon: Users, label: 'Channels' },
      { to: '/agents', icon: Bot, label: 'Agents' },
      { to: '/data-sources', icon: Database, label: 'Data Sources' },
      { to: '/knowledge', icon: BookOpen, label: 'Knowledge' },
    ],
  },
  {
    label: 'Outputs',
    items: [
      { to: '/artifacts', icon: FileText, label: 'Artifacts' },
      { to: '/tasks', icon: ListTodo, label: 'Tasks' },
      { to: '/schedules', icon: Clock, label: 'Schedules' },
    ],
  },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { id: activeId } = useParams();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');

  // Load conversations
  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get('/conversations?per_page=30').then((r) => r.data.data as Conversation[]),
    refetchInterval: 15_000,
  });

  // Channels + DMs + mention badge
  const { data: channelData } = useQuery({
    queryKey: ['channels'],
    queryFn: () => api.get('/channels').then((r) => r.data.data as { channels: Channel[]; mention_count: number }),
    refetchInterval: 5000,
  });
  const channelList = (channelData?.channels ?? []).filter((c) => c.kind === 'channel');
  const dmList = (channelData?.channels ?? []).filter((c) => c.kind === 'dm');
  const mentionCount = channelData?.mention_count ?? 0;

  const { data: wsUsers } = useQuery({
    queryKey: ['channel-users'],
    queryFn: () => api.get('/channels/users').then((r) => r.data.data as WorkspaceUser[]),
    enabled: showNewDm,
  });

  // Online presence — heartbeat polls every 20s
  const { data: onlineUsers } = useQuery({
    queryKey: ['presence'],
    queryFn: () => api.post('/presence/heartbeat').then((r) => r.data.data as Array<{ id: string; name: string }>),
    refetchInterval: 20000,
  });
  const onlineIds = new Set((onlineUsers ?? []).map((u) => u.id));

  const inviteMutation = useMutation({
    mutationFn: () => api.post('/invites'),
    onSuccess: (res) => {
      setInviteUrl(`${window.location.origin}/register?invite=${res.data.data.code}`);
    },
    onError: () => toast.error('Could not create invite'),
  });

  const { data: mentions } = useQuery({
    queryKey: ['mentions'],
    queryFn: () => api.get('/channels/mentions').then((r) => r.data.data as MentionRow[]),
    enabled: showMentions,
    refetchInterval: showMentions ? 4000 : false,
  });

  const dmMutation = useMutation({
    mutationFn: (userId: string) => api.post('/channels/dm', { user_id: userId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      setShowNewDm(false);
      navigate(`/channels/${res.data.data.id}`);
    },
    onError: () => toast.error('Could not open DM'),
  });

  const createChannelMutation = useMutation({
    mutationFn: (payload: { name: string; visibility: string }) => api.post('/channels', payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      setShowNewChannel(false);
      navigate(`/channels/${res.data.data.id}`);
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed'),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/conversations', { title: 'New Conversation' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      navigate(`/chat/${res.data.data.id}`);
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api.patch(`/conversations/${id}`, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/conversations/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      if (activeId === id) navigate('/chat');
      toast.success('Conversation deleted');
    },
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const startEdit = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  return (
    <aside className="flex flex-col h-screen w-64 bg-[#1a1a1a] dark:bg-[#1a1a1a] text-gray-300 border-r border-[#27272a] flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-[#27272a]">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-white">
            <path d="M3.58 8.36C3.19 9.28 3 10.46 3 11.88c0 1.31.17 2.41.52 3.31l.06.17c.4.92.95 1.6 1.65 2.04.69.44 1.48.66 2.37.66.47 0 .91-.04 1.32-.14l.17-.04c.46-.12.86-.3 1.22-.55.32-.23.58-.5.81-.82v5.11h2.94V5.91h-2.46l-.02.1-.2 1.43c-.37-.55-.83-.97-1.4-1.26l-.12-.06c-.64-.31-1.34-.47-2.11-.47-.98 0-1.82.22-2.52.66-.73.44-1.27 1.14-1.65 2.05L3.58 8.36Zm7.53 3.63c0 .57-.05 1.08-.16 1.52l-.04.17c-.1.36-.25.67-.42.92-.21.29-.47.51-.78.67-.32.15-.7.23-1.15.23-.65 0-1.15-.13-1.5-.36l-.08-.05c-.34-.24-.58-.6-.72-1.08l-.03-.09c-.15-.5-.23-1.13-.23-1.88v-.31c0-.82.09-1.48.26-2.01.16-.52.42-.89.79-1.12l.01-.01c.36-.24.85-.38 1.5-.38.59 0 1.07.14 1.44.4.36.27.63.66.82 1.18.17.51.26 1.15.26 1.93v.27h.01Z" fill="currentColor"/>
            <path d="M16.03 3v12.02c0 .49.08.96.25 1.44.19.47.51.86.94 1.16.44.3 1.04.44 1.78.44.2 0 .43-.02.67-.04.24-.03.46-.07.67-.13.23-.04.43-.1.62-.16l.07-.03v-2.07h-1.17c-.3 0-.5-.07-.64-.2-.14-.15-.2-.36-.2-.65V3h-2.95Z" fill="currentColor"/>
          </svg>
        </div>
        <span className="font-medium text-[15px] text-white tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>AgentDesk</span>
      </div>

      {/* New Conversation button */}
      <div className="px-3 pt-3">
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#27272a] hover:bg-[#3a3a3a] text-gray-200 text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Conversation
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto mt-3 px-2">
        {conversations && conversations.length > 0 && (
          <div className="mb-4">
            <p className="px-2 mb-1.5 text-[11px] font-medium text-gray-500 uppercase tracking-wider">Recent</p>
            <div className="space-y-0.5">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    'group flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer transition-colors',
                    activeId === conv.id
                      ? 'bg-[#27272a] text-gray-100'
                      : 'hover:bg-[#27272a]/60 text-gray-400'
                  )}
                  onClick={() => !editingId && navigate(`/chat/${conv.id}`)}
                >
                  <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
                  {editingId === conv.id ? (
                    <div className="flex flex-1 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renameMutation.mutate({ id: conv.id, title: editTitle });
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 text-xs bg-transparent border-b border-[#4e8c6b] outline-none text-gray-100 min-w-0"
                      />
                      <button onClick={() => renameMutation.mutate({ id: conv.id, title: editTitle })} className="text-green-400 hover:text-green-300 flex-shrink-0">
                        <Check className="h-3 w-3" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-300 flex-shrink-0">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className={cn('text-xs truncate flex-1', activeId === conv.id ? 'font-medium' : '')}>
                        {truncate(conv.title, 28)}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); startEdit(conv); }} className="p-0.5 rounded text-gray-500 hover:text-gray-300">
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(conv.id); }} className="p-0.5 rounded text-gray-500 hover:text-red-400">
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Channels section */}
        <div className="mb-3">
          <button
            onClick={() => { setShowInvite(true); if (!inviteUrl) inviteMutation.mutate(); }}
            className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs font-medium text-gray-400 hover:bg-[#27272a]/60 hover:text-gray-200 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
            <span className="flex-1 text-left">Invite people</span>
          </button>

          <button
            onClick={() => setShowMentions(true)}
            className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs font-medium text-gray-400 hover:bg-[#27272a]/60 hover:text-gray-200 transition-colors"
          >
            <AtSign className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
            <span className="flex-1 text-left">Mentions</span>
            {mentionCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse-soft">{mentionCount}</span>
            )}
          </button>

          <div className="mt-2">
            <div className="flex items-center justify-between px-2 mb-1">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Channels</p>
              <button onClick={() => setShowNewChannel(true)} className="text-gray-500 hover:text-gray-300"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <div className="space-y-0.5">
              {channelList.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/channels/${c.id}`)}
                  className={cn(
                    'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                    activeId === c.id ? 'bg-[#27272a] text-indigo-300' : 'text-gray-400 hover:bg-[#27272a]/60 hover:text-gray-200'
                  )}
                >
                  {c.visibility === 'private' ? <Lock className="h-3 w-3 opacity-60 flex-shrink-0" /> : <Hash className="h-3.5 w-3.5 opacity-60 flex-shrink-0" />}
                  <span className="flex-1 text-left truncate">{c.name}</span>
                  {!c.is_member && c.visibility === 'public' && <span className="text-[9px] text-gray-500">join</span>}
                  {c.unread_count > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">{c.unread_count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between px-2 mb-1">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Direct Messages</p>
              <button onClick={() => setShowNewDm(true)} className="text-gray-500 hover:text-gray-300"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <div className="space-y-0.5">
              {dmList.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/channels/${c.id}`)}
                  className={cn(
                    'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                    activeId === c.id ? 'bg-[#27272a] text-indigo-300' : 'text-gray-400 hover:bg-[#27272a]/60 hover:text-gray-200'
                  )}
                >
                  <span className="relative w-4 h-4 rounded-full bg-[#3a3a3a] flex items-center justify-center text-[8px] font-bold text-gray-300 flex-shrink-0">
                    {c.peer_name?.charAt(0).toUpperCase() ?? '?'}
                    {c.peer_id && onlineIds.has(c.peer_id) && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 border border-[#1c1c1c]" />
                    )}
                  </span>
                  <span className="flex-1 text-left truncate">{c.peer_name ?? 'DM'}</span>
                  {c.unread_count > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">{c.unread_count}</span>
                  )}
                </button>
              ))}
              {dmList.length === 0 && <p className="px-2 text-[10px] text-gray-600">No conversations</p>}
            </div>
          </div>
        </div>

        {/* Navigation sections */}
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-3">
            <p className="px-2 mb-1.5 text-[11px] font-medium text-gray-500 uppercase tracking-wider">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => cn(
                    'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-[#27272a] text-indigo-300'
                      : 'text-gray-400 hover:bg-[#27272a]/60 hover:text-gray-200'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom: Settings + Profile */}
      <div className="border-t border-[#27272a] p-2 space-y-0.5">
        <NavLink
          to="/settings"
          className={({ isActive }) => cn(
            'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
            isActive ? 'bg-[#27272a] text-indigo-300' : 'text-gray-400 hover:bg-[#27272a]/60 hover:text-gray-200'
          )}
        >
          <Settings className="h-3.5 w-3.5 opacity-60" />
          Settings
        </NavLink>

        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
            {user?.name?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-200 truncate">{user?.name ?? 'User'}</p>
            <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs w-full text-left text-gray-500 hover:text-gray-300 hover:bg-[#27272a]/60 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5 opacity-60" />
          Log out
        </button>
      </div>

      {/* New channel dialog */}
      <Dialog open={showNewChannel} onClose={() => setShowNewChannel(false)} title="Create channel" size="sm">
        <NewChannelForm onSubmit={(name, visibility) => createChannelMutation.mutate({ name, visibility })} loading={createChannelMutation.isPending} />
      </Dialog>

      {/* New DM dialog */}
      <Dialog open={showNewDm} onClose={() => setShowNewDm(false)} title="Direct message" size="sm">
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {(wsUsers ?? []).filter((m) => !m.is_bot && m.id !== user?.id).map((m) => (
            <button
              key={m.id}
              onClick={() => dmMutation.mutate(m.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[11px] font-semibold">
                {m.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{m.name}</span>
              <span className="text-xs text-gray-400">@{m.handle}</span>
            </button>
          ))}
          {(wsUsers ?? []).filter((m) => !m.is_bot && m.id !== user?.id).length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">No other members in this workspace yet</p>
          )}
        </div>
      </Dialog>

      {/* Invite dialog */}
      <Dialog open={showInvite} onClose={() => setShowInvite(false)} title="Invite people" size="sm">
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Share this link — anyone who registers with it joins this workspace.</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteMutation.isPending ? 'Generating…' : inviteUrl}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-700 dark:text-gray-300"
            />
            <Button
              size="sm"
              disabled={!inviteUrl}
              onClick={() => { navigator.clipboard.writeText(inviteUrl).catch(() => {}); toast.success('Copied'); }}
            >
              Copy
            </Button>
          </div>
          <p className="text-[10px] text-gray-400">Each link can be used by multiple people. Generate a new one to rotate it.</p>
          <Button variant="secondary" size="sm" className="w-full" onClick={() => inviteMutation.mutate()} loading={inviteMutation.isPending}>
            Generate new link
          </Button>
        </div>
      </Dialog>

      {/* Mentions panel */}
      <Dialog open={showMentions} onClose={() => {
        setShowMentions(false);
        api.post('/channels/mentions/read').then(() => qc.invalidateQueries({ queryKey: ['channels'] }));
      }} title="You were mentioned" size="md">
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {(mentions ?? []).length === 0 && <p className="text-sm text-gray-400 py-4 text-center">No mentions yet</p>}
          {(mentions ?? []).map((m) => (
            <button
              key={m.mention_id}
              onClick={() => {
                setShowMentions(false);
                api.post('/channels/mentions/read').then(() => qc.invalidateQueries({ queryKey: ['channels'] }));
                navigate(m.channel_kind === 'ai' ? `/chat/${m.channel_id}` : `/channels/${m.channel_id}`);
              }}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-medium text-gray-900 dark:text-gray-100">{m.author_name}</span>
                <span>in {m.channel_kind === 'dm' ? 'a DM' : m.channel_kind === 'ai' ? 'a chat' : `#${m.channel_name}`}</span>
                <span className="ml-auto">{timeAgo(m.created_at)}</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 truncate">{m.content}</p>
            </button>
          ))}
        </div>
      </Dialog>
    </aside>
  );
}

function NewChannelForm({ onSubmit, loading }: { onSubmit: (name: string, visibility: string) => void; loading: boolean }) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState('public');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(name, visibility); }} className="space-y-3">
      <Input label="Channel name" value={name} onChange={(e) => setName(e.target.value)} placeholder="engineering" required />
      <Select
        label="Visibility"
        value={visibility}
        onChange={(e) => setVisibility(e.target.value)}
        options={[
          { value: 'public', label: 'Public — anyone in the workspace can join' },
          { value: 'private', label: 'Private — invite only' },
        ]}
      />
      <Button type="submit" loading={loading} className="w-full">Create channel</Button>
    </form>
  );
}
