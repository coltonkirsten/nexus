export type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export type MessageStatus = 'pending' | 'processing' | 'completed' | 'failed';

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
}

export interface QueueStats {
  agentId: string;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}
