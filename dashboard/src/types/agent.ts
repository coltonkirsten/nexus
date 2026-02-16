export type AgentStatus = 'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

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
  sessionPersistence?: boolean;
  healthStatus?: string;
  healthFailures?: number;
  config?: AgentConfig;
}

export interface CreateAgentRequest {
  name: string;
  template?: string;
}

export interface SendMessageRequest {
  message: string;
  sessionId?: string;
}

export interface SessionInfo {
  sessionId: string | null;
  active: boolean;
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
