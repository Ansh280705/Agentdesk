export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: string;
}

export interface Preferences {
  theme: 'light' | 'dark' | 'system';
  default_model: string;
  sidebar_collapsed: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  agent_id?: string;
  message_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  tool_name?: string;
  metadata?: Record<string, unknown>;
  feedback?: 'up' | 'down' | null;
  created_at: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
  allowed_tools: string[];
  max_tool_calls: number;
  max_iterations: number;
  requires_approval: boolean;
  is_enabled: boolean;
  is_template: boolean;
  template_type?: string;
  created_at: string;
  updated_at: string;
}

export interface DataSource {
  id: string;
  name: string;
  type: string;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  config_public: Record<string, string>;
  last_synced_at?: string;
  created_at: string;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  content?: string;
  excerpt?: string;
  type: 'note' | 'document' | 'procedure' | 'fact';
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  events?: TaskEvent[];
}

export interface TaskEvent {
  id: string;
  event_type: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface Artifact {
  id: string;
  name: string;
  type: 'report' | 'csv' | 'json' | 'chart' | 'markdown' | 'table';
  mime_type: string;
  size_bytes: number;
  content?: string;
  conversation_id?: string;
  created_at: string;
}

export interface DashboardData {
  recent_conversations: (Conversation & { message_count: number })[];
  recent_tasks: Task[];
  recent_artifacts: Artifact[];
  stats: {
    active_agents: number;
    connected_sources: number;
    knowledge_documents: number;
    messages_this_month: number;
  };
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages?: number;
}

export interface AgentStatus {
  status: 'idle' | 'understanding' | 'planning' | 'tool_calling' | 'checking' | 'generating' | 'completed' | 'failed';
  detail?: string;
}

export interface ChartSpec {
  artifact_type: 'chart';
  title: string;
  type: 'bar' | 'line' | 'pie' | 'area' | 'scatter';
  data: Record<string, string | number>[];
  x_key: string;
  y_keys: string[];
  description?: string;
}

export interface LearnedInsight {
  title: string;
  content: string;
  type: 'fact' | 'note' | 'procedure';
  tags: string[];
}
