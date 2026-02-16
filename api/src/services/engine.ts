import { getAgent } from './agents.js';

const CONTAINER_TIMEOUT = 10000; // 10 seconds

// Error types for better classification
type EngineErrorType = 'connection_refused' | 'timeout' | 'container_crashed' | 'network_error' | 'agent_busy' | 'unknown';

interface EngineError {
  type: EngineErrorType;
  message: string;
  recoverable: boolean;
}

function classifyError(error: unknown): EngineError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error ? error.name : '';

  // Connection refused - container is not running or crashed
  if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect ECONNREFUSED')) {
    return {
      type: 'connection_refused',
      message: 'Container is not responding - it may have crashed or not started',
      recoverable: true
    };
  }

  // Timeout errors
  if (errorName === 'AbortError' || errorMessage.includes('aborted') || errorMessage.includes('timeout')) {
    return {
      type: 'timeout',
      message: 'Request timed out - container may be overloaded or unresponsive',
      recoverable: true
    };
  }

  // Network-related errors
  if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('ENETUNREACH') ||
      errorMessage.includes('EHOSTUNREACH') || errorMessage.includes('ECONNRESET')) {
    return {
      type: 'network_error',
      message: `Network error: ${errorMessage}`,
      recoverable: true
    };
  }

  // Container crashed during request
  if (errorMessage.includes('socket hang up') || errorMessage.includes('EPIPE')) {
    return {
      type: 'container_crashed',
      message: 'Container crashed or closed connection unexpectedly',
      recoverable: true
    };
  }

  return {
    type: 'unknown',
    message: errorMessage,
    recoverable: false
  };
}

export interface SendMessageOptions {
  sessionPersistence?: boolean;
  waitForResponse?: boolean;
  timeout?: number;
  config?: {
    model?: string;
    maxTurns?: number;
    timeout?: number;       // seconds
    allowedTools?: string[];
  };
}

export async function sendMessage(
  agentId: string,
  message: string,
  options: SendMessageOptions = {}
): Promise<{ success: boolean; response?: string; error?: string; errorType?: EngineErrorType; recoverable?: boolean }> {
  const agent = await getAgent(agentId);

  if (!agent || !agent.port) {
    return { success: false, error: 'Agent not found or not configured', recoverable: false };
  }

  if (agent.status !== 'running') {
    return { success: false, error: 'Agent is not running', recoverable: true };
  }

  try {
    const controller = new AbortController();
    // Use longer timeout for conversation mode (waiting for full response)
    const requestTimeout = options.waitForResponse ? 300000 : CONTAINER_TIMEOUT; // 5 minutes vs 10 seconds
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    const response = await fetch(`http://localhost:${agent.port}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        config: options.config,
        sessionPersistence: options.sessionPersistence ?? true,
        waitForResponse: options.waitForResponse,
        timeout: options.config?.timeout ? options.config.timeout * 1000 : options.timeout,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Handle specific HTTP error codes
      if (response.status === 409) {
        return {
          success: false,
          error: 'Agent is busy processing another task',
          errorType: 'agent_busy',
          recoverable: true,
        };
      }
      if (response.status === 503) {
        return {
          success: false,
          error: 'Engine is temporarily unavailable',
          errorType: 'container_crashed',
          recoverable: true
        };
      }
      return {
        success: false,
        error: `Engine returned ${response.status}`,
        recoverable: response.status >= 500
      };
    }

    const data = await response.json() as { response?: string };
    return { success: true, response: data.response };
  } catch (error) {
    const classified = classifyError(error);
    return {
      success: false,
      error: `Failed to communicate with engine: ${classified.message}`,
      errorType: classified.type,
      recoverable: classified.recoverable
    };
  }
}

export async function getHealth(agentId: string): Promise<{ healthy: boolean; details?: Record<string, unknown>; error?: string; errorType?: EngineErrorType }> {
  const agent = await getAgent(agentId);

  if (!agent || !agent.port) {
    return { healthy: false, error: 'Agent not found or not configured' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://localhost:${agent.port}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { healthy: false, error: `Health check returned ${response.status}` };
    }

    const data = await response.json() as Record<string, unknown>;
    return { healthy: true, details: data };
  } catch (error) {
    const classified = classifyError(error);
    return {
      healthy: false,
      error: classified.message,
      errorType: classified.type
    };
  }
}

export interface StreamLogsResult {
  stream: ReadableStream | null;
  error?: string;
  errorType?: EngineErrorType;
}

export async function streamLogs(agentId: string): Promise<StreamLogsResult> {
  const agent = await getAgent(agentId);

  if (!agent || !agent.port) {
    return { stream: null, error: 'Agent not found or not configured' };
  }

  try {
    const response = await fetch(`http://localhost:${agent.port}/logs`, {
      method: 'GET',
      headers: { 'Accept': 'text/event-stream' },
    });

    if (!response.ok || !response.body) {
      return { stream: null, error: `Failed to stream logs: ${response.status}` };
    }

    return { stream: response.body };
  } catch (error) {
    const classified = classifyError(error);
    return {
      stream: null,
      error: classified.message,
      errorType: classified.type
    };
  }
}

export interface SessionInfo {
  active: boolean;
  messageCount?: number;
  createdAt?: string;
  lastActivityAt?: string;
}

export async function getSession(agentId: string): Promise<{ success: boolean; session?: SessionInfo; error?: string; errorType?: EngineErrorType; recoverable?: boolean }> {
  const agent = await getAgent(agentId);

  if (!agent || !agent.port) {
    return { success: false, error: 'Agent not found or not configured', recoverable: false };
  }

  if (agent.status !== 'running') {
    return { success: false, error: 'Agent is not running', recoverable: true };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://localhost:${agent.port}/session`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: `Engine returned ${response.status}`, recoverable: response.status >= 500 };
    }

    const data = await response.json() as SessionInfo;
    return { success: true, session: data };
  } catch (error) {
    const classified = classifyError(error);
    return {
      success: false,
      error: `Failed to get session: ${classified.message}`,
      errorType: classified.type,
      recoverable: classified.recoverable
    };
  }
}

export async function clearSession(agentId: string): Promise<{ success: boolean; error?: string; errorType?: EngineErrorType; recoverable?: boolean }> {
  const agent = await getAgent(agentId);

  if (!agent || !agent.port) {
    return { success: false, error: 'Agent not found or not configured', recoverable: false };
  }

  if (agent.status !== 'running') {
    return { success: false, error: 'Agent is not running', recoverable: true };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://localhost:${agent.port}/session/clear`, {
      method: 'POST',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { success: false, error: `Engine returned ${response.status}`, recoverable: response.status >= 500 };
    }

    return { success: true };
  } catch (error) {
    const classified = classifyError(error);
    return {
      success: false,
      error: `Failed to clear session: ${classified.message}`,
      errorType: classified.type,
      recoverable: classified.recoverable
    };
  }
}
