export type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export type MessageStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type VolumeType = 'ledger' | 'workspace';

export interface Volume {
  id: string;
  name: string;
  type: VolumeType;
  dockerVolume: string;        // actual Docker volume name
  createdAt: string;
  attachedTo?: string;         // agent ID or undefined
  template?: string;
  description?: string;
  clonedFrom?: string;
}

export interface VolumeState {
  volumes: Volume[];
}

export interface RuntimeConfig {
  model?: string;
  maxTurns?: number;
  timeout?: number;       // seconds
  allowedTools?: string[];
}

export interface Agent {
  id: string;
  name: string;
  template?: string;
  cellType?: string;
  createdAt: string;
  lastActivity?: string;
  containerId?: string;
  port?: number;
  status: AgentStatus;
  healthStatus?: HealthStatus;
  healthFailures?: number;
  config?: RuntimeConfig;
  ledgerVolumeId?: string;
  workspaceVolumeId?: string;
  teamId?: string;
  // Health monitoring fields
  startedAt?: string;
  restartCount?: number;
  lastCrashTime?: string;
  // Pause/resume fields
  pausedAt?: string;
  pauseReason?: string;
  pausedMessageIds?: string[];
}

export interface AgentConfig {
  name: string;
  template?: string;
  cellType?: string;
}

export interface Message {
  id: string;
  agentId: string;
  content: string;
  role: 'user' | 'agent' | 'system';
  timestamp: string;
  metadata?: Record<string, unknown>;
  status: MessageStatus;
}

export type AgentStatus = 'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'rebuilding' | 'paused' | 'error';

export interface AgentState {
  agents: Agent[];
}

export interface MessageQueue {
  agentId: string;
  messages: Message[];
}

export interface ContainerConfig {
  agentId: string;
  agentName?: string;
  port: number;
  cellType?: string;
  credentialEnv?: string[];  // pre-resolved env var array ["KEY=value", ...]
  ledgerVolume?: string;     // Docker volume name for /ledger mount
  workspaceVolume?: string;  // Docker volume name for /workspace mount
  sharedVolume?: string;     // Docker volume name for /shared mount
  teamId?: string;           // Team ID for mailbox access
}

export interface QueueStats {
  agentId: string;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

// --- Teams ---

export interface Team {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  sharedVolume: string; // Docker volume name: "nexus-team-{id}"
}

export interface TeamState {
  teams: Team[];
}

export type TeamEventType =
  | 'agent_joined'
  | 'agent_left'
  | 'agent_started'
  | 'agent_stopped'
  | 'agent_rebuilt'
  | 'agent_deleted'
  | 'agent_paused'
  | 'agent_resumed'
  | 'message_sent'
  | 'mail_sent'
  | 'mail_received'
  | 'processing_started'
  | 'processing_completed'
  | 'processing_failed'
  | 'session_cleared'
  | 'intercom_sent'
  | 'board_created'
  | 'board_deleted'
  | 'card_created'
  | 'card_moved'
  | 'card_deleted'
  | 'card_completed';

export interface TeamEvent {
  id: string;
  teamId: string;
  type: TeamEventType;
  timestamp: string;
  agentId: string;
  agentName: string;
  data?: Record<string, unknown>;
  runId?: string;
}

export interface TeamEventLog {
  teamId: string;
  events: TeamEvent[];
}

// --- Cron Jobs ---

export type ScheduleKind = 'cron' | 'at' | 'every';

export interface CronSchedule {
  kind: 'cron';
  expression: string;   // 5-field cron (min hour dom mon dow)
  timezone?: string;     // IANA timezone, default UTC
}

export interface AtSchedule {
  kind: 'at';
  datetime: string;      // ISO 8601
}

export interface EverySchedule {
  kind: 'every';
  intervalMs: number;    // minimum 60000 (1 min)
}

export type Schedule = CronSchedule | AtSchedule | EverySchedule;

export interface CronJob {
  id: string;
  agentId: string;
  name: string;
  schedule: Schedule;
  message: string;       // content enqueued when job fires
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: 'user' | 'agent';
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failed' | 'skipped';
  nextRunAt?: string;    // computed at read-time, not persisted
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

export interface CronJobState {
  jobs: CronJob[];
}

// --- Human Mailbox ---

export type MailDirection = 'agent_to_human' | 'human_to_agent';

export interface FileAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string; // Relative path within uploads directory
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

// --- Unified Run Logging ---

export type RunTriggerSource = 'mail' | 'cron' | 'manual' | 'intercom';

export type RunStatus = 'active' | 'completed' | 'failed';

export interface Run {
  id: string;
  teamId: string;
  triggerSource: RunTriggerSource;
  triggerAgentId: string;
  triggerAgentName: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  agentIds: string[];
  eventIds: string[];
  metadata?: Record<string, unknown>;
}

export interface RunState {
  runs: Run[];
}

// --- Kanban Boards ---

export type CardPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ActivityEntry {
  timestamp: string;
  action: string;
  actor: string;
  details?: string;
}

export interface Card {
  id: string;
  title: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  priority?: CardPriority;
  labels: string[];
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  activity: ActivityEntry[];
}

export interface Column {
  id: string;
  name: string;
  position: number;
  cards: Card[];
}

export interface Board {
  id: string;
  teamId: string;
  name: string;
  description?: string;
  columns: Column[];
  createdAt: string;
  updatedAt: string;
}
