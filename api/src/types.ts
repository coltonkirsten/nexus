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
}

export interface AgentConfig {
  name: string;
  template?: string;
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

export type AgentStatus = 'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export interface AgentState {
  agents: Agent[];
}

export interface MessageQueue {
  agentId: string;
  messages: Message[];
}

export interface ContainerConfig {
  agentId: string;
  port: number;
  apiKey?: string;
  ledgerVolume?: string;     // Docker volume name for /ledger mount
  workspaceVolume?: string;  // Docker volume name for /workspace mount
  sharedVolume?: string;     // Docker volume name for /shared mount
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

export interface TeamEventLog {
  teamId: string;
  events: TeamEvent[];
}
