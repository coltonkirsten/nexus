export type AgentStatus = 'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export type VolumeType = 'ledger' | 'workspace';

export interface Volume {
  id: string;
  name: string;
  type: VolumeType;
  dockerVolume: string;
  createdAt: string;
  attachedTo?: string;
  template?: string;
  description?: string;
  clonedFrom?: string;
}

export interface AgentConfig {
  model?: string;
  maxTurns?: number;
  timeout?: number;
  allowedTools?: string[];
}

export interface Agent {
  id: string;
  name: string;
  template?: string;
  port?: number;
  containerId?: string;
  status: AgentStatus;
  createdAt: string;
  lastActivity?: string;
  healthStatus?: string;
  healthFailures?: number;
  config?: AgentConfig;
  ledgerVolumeId?: string;
  workspaceVolumeId?: string;
  teamId?: string;
}

export interface CreateAgentRequest {
  name: string;
  template?: string;
}

export interface SendMessageRequest {
  message: string;
}

export interface SessionInfo {
  sessionId: string | null;
  persistenceEnabled: boolean;
  filePath: string;
}

// --- Teams ---

export interface Team {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  sharedVolume: string;
}

export type TeamEventType =
  | 'agent_joined'
  | 'agent_left'
  | 'agent_started'
  | 'agent_stopped'
  | 'agent_deleted'
  | 'message_sent'
  | 'processing_started'
  | 'processing_completed'
  | 'processing_failed';

export interface TeamEvent {
  id: string;
  teamId: string;
  type: TeamEventType;
  timestamp: string;
  agentId: string;
  agentName: string;
  data?: Record<string, unknown>;
}

// Rich SSE log entry (as sent by cell engine)
export interface RichLogEntry {
  timestamp: string;
  type: string;
  data: unknown;
}

// Parsed content blocks from assistant messages
export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ContentBlock = TextBlock | ToolUseBlock;

// Tool call for conversation view
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}

// Conversation turn for the unified view
export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  userText?: string;
  textContent: string;
  toolCalls: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
  costUsd?: number;
  durationMs?: number;
  isStreaming?: boolean;
}

// --- Cron Jobs ---

export type ScheduleKind = 'cron' | 'at' | 'every';

export interface CronSchedule {
  kind: 'cron';
  expression: string;
  timezone?: string;
}

export interface AtSchedule {
  kind: 'at';
  datetime: string;
}

export interface EverySchedule {
  kind: 'every';
  intervalMs: number;
}

export type Schedule = CronSchedule | AtSchedule | EverySchedule;

export interface CronJob {
  id: string;
  agentId: string;
  name: string;
  schedule: Schedule;
  message: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: 'user' | 'agent';
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failed' | 'skipped';
  nextRunAt?: string;
  runCount: number;
}

export interface CronRunRecord {
  jobId: string;
  agentId: string;
  timestamp: string;
  status: 'enqueued' | 'skipped_agent_stopped' | 'skipped_disabled' | 'error';
  messageId?: string;
  error?: string;
}
