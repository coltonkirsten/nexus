export type AgentStatus = 'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'rebuilding' | 'error' | 'paused';

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
  cellType?: string;
  port?: number;
  containerId?: string;
  status: AgentStatus;
  createdAt: string;
  startedAt?: string;
  lastActivity?: string;
  healthStatus?: string;
  healthFailures?: number;
  restartCount?: number;
  config?: AgentConfig;
  ledgerVolumeId?: string;
  workspaceVolumeId?: string;
  teamId?: string;
  isProcessing?: boolean;
  // Pause state
  pausedAt?: string;
  pauseReason?: 'user' | 'oauth_expired' | 'error';
  pausedMessageIds?: string[];
}

// Health summary for the dashboard
export interface HealthSummary {
  totalAgents: number;
  runningCount: number;
  stoppedCount: number;
  errorCount: number;
  agentsWithRestarts: Agent[];
  recentCrashes: Agent[];
}

export interface CreateAgentRequest {
  name: string;
  template?: string;
  cellType?: string;
}

// --- Cell Types ---

export interface CredentialField {
  key: string;
  label: string;
  required: boolean;
  sensitive?: boolean;
  placeholder?: string;
}

export interface ModelOption {
  value: string;
  label: string;
}

export interface SettingField {
  key: string;
  label: string;
  description: string;
  type: 'boolean';
  default: boolean;
}

export interface CellTypeDefinition {
  id: string;
  name: string;
  description: string;
  credentials: CredentialField[];
  settings?: SettingField[];
  engineMode: string;
  models: ModelOption[];
}

export type CredentialStore = Record<string, Record<string, string>>;

export interface SendMessageRequest {
  message: string;
  attachments?: FileAttachment[];
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
  | 'agent_rebuilt'
  | 'agent_deleted'
  | 'message_sent'
  | 'mail_sent'
  | 'mail_received'
  | 'processing_started'
  | 'processing_completed'
  | 'processing_failed'
  | 'session_cleared'
  | 'intercom_sent'
  | 'agent_paused'
  | 'agent_resumed';

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

// --- Human Mailbox ---

export type MailDirection = 'agent_to_human' | 'human_to_agent';

export interface FileAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
}

export interface MailMessage {
  id: string;
  teamId: string;
  direction: MailDirection;
  agentId: string;
  agentName: string;
  subject: string;
  body: string;
  category?: 'question' | 'approval' | 'status' | 'deliverable' | 'general';
  read: boolean;
  timestamp: string;
  replyToId?: string;
  metadata?: Record<string, unknown>;
  attachments?: FileAttachment[];
}

// --- Runs (Timeline) ---

export type RunTriggerSource = 'cron' | 'mail' | 'intercom' | 'user' | 'api';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Run {
  id: string;
  teamId: string;
  agentId: string;
  agentName: string;
  trigger: RunTriggerSource;
  triggerId?: string; // cronJobId, mailId, etc.
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  eventIds: string[];
  inputPreview?: string;
  outputPreview?: string;
  error?: string;
  durationMs?: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
  costUsd?: number;
}

export interface TimelineData {
  events: TeamEvent[];
  runs: Run[];
  agents: Array<{
    id: string;
    name: string;
  }>;
  timeRange: {
    start: string;
    end: string;
  };
}
