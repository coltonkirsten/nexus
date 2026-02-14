export type AgentMode = 'task' | 'conversation';

export type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export type MessageStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Agent {
  id: string;
  name: string;
  template?: string;
  createdAt: string;
  containerId?: string;
  port?: number;
  status: AgentStatus;
  mode: AgentMode;
  sessionPersistence: boolean;
  healthStatus?: HealthStatus;
  healthFailures?: number;
}

export interface AgentConfig {
  name: string;
  template?: string;
  mode?: AgentMode;
  sessionPersistence?: boolean;
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
}

export interface QueueStats {
  agentId: string;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}
