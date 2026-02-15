export type AgentStatus = 'idle' | 'processing' | 'stopped' | 'running' | 'starting' | 'stopping' | 'error' | 'created';

export interface AgentConfig {
  model: string;
  maxTurns: number;
  timeout: number;
  allowedTools: string[];
}

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  createdAt: string;
  lastActivity?: string;
  config?: AgentConfig;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'system' | 'user' | 'agent' | 'error';
  message: string;
}

export interface CreateAgentRequest {
  name: string;
  template?: string;
}

export interface SendMessageRequest {
  message: string;
  conversationMode?: boolean;
  sessionId?: string;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface SessionInfo {
  sessionId: string | null;
  active: boolean;
}

export interface ConversationResponse {
  response: string;
  sessionId: string;
}
