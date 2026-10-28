// Shared types between frontend and backend

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  user_id: string;
  agent_id?: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
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
  function: {
    name: string;
    arguments: string;
  };
}

export interface Agent {
  id: string;
  workspace_id: string;
  user_id: string;
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
  workspace_id: string;
  user_id: string;
  name: string;
  type: string;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  config: Record<string, unknown>;
  last_synced_at?: string;
  created_at: string;
}

export interface KnowledgeDocument {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  content: string;
  type: 'note' | 'document' | 'procedure' | 'fact';
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  workspace_id: string;
  user_id: string;
  conversation_id?: string;
  type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface TaskEvent {
  id: string;
  task_id: string;
  event_type: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface Artifact {
  id: string;
  workspace_id: string;
  user_id: string;
  conversation_id?: string;
  name: string;
  type: 'report' | 'csv' | 'json' | 'chart' | 'markdown' | 'table';
  content: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  default_model: string;
  sidebar_collapsed: boolean;
}

// API response wrappers
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

// Agent execution types
export interface AgentExecutionContext {
  conversation_id: string;
  user_id: string;
  workspace_id: string;
  agent_id?: string;
  model: string;
  system_prompt: string;
  allowed_tools: string[];
  max_tool_calls: number;
  max_iterations: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type AgentStatus =
  | 'idle'
  | 'understanding'
  | 'planning'
  | 'retrieving'
  | 'tool_calling'
  | 'checking'
  | 'generating'
  | 'completed'
  | 'failed';
