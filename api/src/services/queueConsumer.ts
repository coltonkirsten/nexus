import {
  dequeueMessage,
  updateMessageStatus,
  getAgent,
  listAgents,
} from './agents.js';
import { sendMessage } from './engine.js';
import { emitTeamEvent } from './teams.js';
import { v4 as uuidv4 } from 'uuid';
import type { RuntimeConfig } from '../types.js';

// Per-agent consumer state
interface AgentConsumer {
  agentId: string;
  isProcessing: boolean;
  currentMessageId: string | null;
  retryCount: number;
  sseAbortController: AbortController | null;
  drainTimer: ReturnType<typeof setTimeout> | null;
}

// In-memory registry of active consumers
const consumers = new Map<string, AgentConsumer>();

const MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 2000;
const BUSY_RETRY_DELAY_MS = 2000;
const SSE_RECONNECT_DELAY_MS = 5000;
// Safety drain timeout: default task timeout (10 min) + 30s buffer
const DRAIN_TIMEOUT_MS = 630000;

function log(agentId: string, msg: string): void {
  console.log(`[QueueConsumer:${agentId.slice(0, 8)}] ${msg}`);
}

/**
 * Start a queue consumer for an agent. Opens an SSE connection
 * to the engine's /logs endpoint and listens for completion events.
 */
export async function startConsumer(agentId: string): Promise<void> {
  // Don't start duplicate consumers
  if (consumers.has(agentId)) {
    log(agentId, 'Consumer already running, skipping');
    return;
  }

  const consumer: AgentConsumer = {
    agentId,
    isProcessing: false,
    currentMessageId: null,
    retryCount: 0,
    sseAbortController: null,
    drainTimer: null,
  };

  consumers.set(agentId, consumer);
  log(agentId, 'Consumer started');

  // Start listening for completion events
  listenForCompletion(agentId);

  // Try to process any pending messages immediately
  await tryProcessNext(agentId);
}

/**
 * Stop a queue consumer for an agent. Aborts SSE connection
 * and resets any in-flight message back to 'pending'.
 */
export async function stopConsumer(agentId: string): Promise<void> {
  const consumer = consumers.get(agentId);
  if (!consumer) return;

  log(agentId, 'Stopping consumer');

  // Abort SSE connection
  if (consumer.sseAbortController) {
    consumer.sseAbortController.abort();
    consumer.sseAbortController = null;
  }

  // Clear drain timer
  if (consumer.drainTimer) {
    clearTimeout(consumer.drainTimer);
    consumer.drainTimer = null;
  }

  // Reset any in-flight message back to pending
  if (consumer.currentMessageId) {
    try {
      await updateMessageStatus(agentId, consumer.currentMessageId, 'pending');
      log(agentId, `Reset message ${consumer.currentMessageId.slice(0, 8)} back to pending`);
    } catch (err) {
      console.error(`[QueueConsumer] Failed to reset message status:`, err);
    }
  }

  consumers.delete(agentId);
  log(agentId, 'Consumer stopped');
}

/**
 * Listen to engine SSE /logs stream for agent_complete/agent_error events.
 * On completion, marks the current message done and processes next.
 * Reconnects on disconnect if the agent is still running.
 */
function listenForCompletion(agentId: string): void {
  const consumer = consumers.get(agentId);
  if (!consumer) return;

  const agent = consumers.get(agentId);
  if (!agent) return;

  connectSSE(agentId);
}

async function connectSSE(agentId: string): Promise<void> {
  const consumer = consumers.get(agentId);
  if (!consumer) return;

  const agentData = await getAgent(agentId);
  if (!agentData || !agentData.port) {
    log(agentId, 'Agent not found or no port, will retry SSE connection');
    scheduleSSEReconnect(agentId);
    return;
  }

  // Abort any previous connection
  if (consumer.sseAbortController) {
    consumer.sseAbortController.abort();
  }

  const abortController = new AbortController();
  consumer.sseAbortController = abortController;

  try {
    const response = await fetch(`http://localhost:${agentData.port}/logs`, {
      method: 'GET',
      headers: { 'Accept': 'text/event-stream' },
      signal: abortController.signal,
    });

    if (!response.ok || !response.body) {
      log(agentId, `SSE connection failed with status ${response.status}`);
      scheduleSSEReconnect(agentId);
      return;
    }

    log(agentId, 'SSE connection established');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;

              try {
                const entry = JSON.parse(jsonStr) as { type: string; data: unknown };
                await handleSSEEvent(agentId, entry);
              } catch {
                // Ignore malformed JSON
              }
            }
          }
        }
      } catch (err) {
        // Check if this was an intentional abort
        if (abortController.signal.aborted) return;
        log(agentId, `SSE stream error: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Stream ended — reconnect if consumer is still active
      if (consumers.has(agentId) && !abortController.signal.aborted) {
        log(agentId, 'SSE stream ended, scheduling reconnect');
        scheduleSSEReconnect(agentId);
      }
    };

    pump();
  } catch (err) {
    if (abortController.signal.aborted) return;
    log(agentId, `SSE connection error: ${err instanceof Error ? err.message : String(err)}`);
    scheduleSSEReconnect(agentId);
  }
}

function scheduleSSEReconnect(agentId: string): void {
  // Only reconnect if consumer is still registered
  if (!consumers.has(agentId)) return;

  setTimeout(() => {
    if (consumers.has(agentId)) {
      log(agentId, 'Reconnecting SSE...');
      connectSSE(agentId);
    }
  }, SSE_RECONNECT_DELAY_MS);
}

async function handleSSEEvent(
  agentId: string,
  entry: { type: string; data: unknown }
): Promise<void> {
  const consumer = consumers.get(agentId);
  if (!consumer) return;

  if (entry.type === 'agent_complete') {
    log(agentId, 'Received agent_complete event');

    // Clear drain timer
    if (consumer.drainTimer) {
      clearTimeout(consumer.drainTimer);
      consumer.drainTimer = null;
    }

    // Mark current message as completed
    if (consumer.currentMessageId) {
      try {
        await updateMessageStatus(agentId, consumer.currentMessageId, 'completed');
        log(agentId, `Message ${consumer.currentMessageId.slice(0, 8)} completed`);
      } catch (err) {
        console.error('[QueueConsumer] Failed to update message status:', err);
      }
    }

    // Emit team processing_completed event
    try {
      const agent = await getAgent(agentId);
      if (agent?.teamId) {
        await emitTeamEvent({
          id: uuidv4(),
          teamId: agent.teamId,
          type: 'processing_completed',
          timestamp: new Date().toISOString(),
          agentId,
          agentName: agent.name,
        });
      }
    } catch { /* best-effort */ }

    consumer.currentMessageId = null;
    consumer.isProcessing = false;
    consumer.retryCount = 0;

    // Process next queued message
    await tryProcessNext(agentId);
  } else if (entry.type === 'agent_error') {
    log(agentId, 'Received agent_error event');

    // Clear drain timer
    if (consumer.drainTimer) {
      clearTimeout(consumer.drainTimer);
      consumer.drainTimer = null;
    }

    // Mark current message as failed
    if (consumer.currentMessageId) {
      try {
        await updateMessageStatus(agentId, consumer.currentMessageId, 'failed');
        log(agentId, `Message ${consumer.currentMessageId.slice(0, 8)} failed`);
      } catch (err) {
        console.error('[QueueConsumer] Failed to update message status:', err);
      }
    }

    // Emit team processing_failed event
    try {
      const agent = await getAgent(agentId);
      if (agent?.teamId) {
        await emitTeamEvent({
          id: uuidv4(),
          teamId: agent.teamId,
          type: 'processing_failed',
          timestamp: new Date().toISOString(),
          agentId,
          agentName: agent.name,
          data: { error: entry.data },
        });
      }
    } catch { /* best-effort */ }

    consumer.currentMessageId = null;
    consumer.isProcessing = false;
    consumer.retryCount = 0;

    // Process next queued message
    await tryProcessNext(agentId);
  }
}

/**
 * Try to process the next pending message in the queue.
 * If already processing, this is a no-op (the SSE listener handles dispatch).
 */
export async function tryProcessNext(agentId: string): Promise<void> {
  const consumer = consumers.get(agentId);
  if (!consumer) return;

  // Already processing — SSE will trigger next dispatch
  if (consumer.isProcessing) return;

  // Dequeue next pending message
  const message = await dequeueMessage(agentId);
  if (!message) return; // Nothing in queue

  consumer.isProcessing = true;
  consumer.currentMessageId = message.id;
  consumer.retryCount = 0;

  // Prefix inter-agent messages with sender info
  let content = message.content;
  if (message.role === 'agent' && message.metadata?.fromAgentName) {
    content = `[Message from agent "${message.metadata.fromAgentName}"]: ${content}`;
  }
  if (message.metadata?.triggerType === 'cron') {
    content = `[Scheduled task "${message.metadata.cronJobName}"]: ${content}`;
  }

  log(agentId, `Dispatching message ${message.id.slice(0, 8)}: "${content.slice(0, 50)}..."`);

  // Get agent config for sendMessage
  const agent = await getAgent(agentId);
  if (!agent) {
    log(agentId, 'Agent not found, marking message failed');
    await updateMessageStatus(agentId, message.id, 'failed');
    consumer.isProcessing = false;
    consumer.currentMessageId = null;
    return;
  }

  await dispatchMessage(agentId, message.id, content, agent.config);

  // Emit team processing_started event
  if (agent.teamId) {
    try {
      await emitTeamEvent({
        id: uuidv4(),
        teamId: agent.teamId,
        type: 'processing_started',
        timestamp: new Date().toISOString(),
        agentId,
        agentName: agent.name,
      });
    } catch { /* best-effort */ }
  }
}

async function dispatchMessage(
  agentId: string,
  messageId: string,
  content: string,
  config?: RuntimeConfig
): Promise<void> {
  const consumer = consumers.get(agentId);
  if (!consumer) return;

  const result = await sendMessage(agentId, content, {
    sessionPersistence: true,
    config,
  });

  if (result.success) {
    log(agentId, `Message ${messageId.slice(0, 8)} dispatched to engine`);

    // Set safety drain timer in case SSE misses completion
    if (consumer.drainTimer) {
      clearTimeout(consumer.drainTimer);
    }
    consumer.drainTimer = setTimeout(async () => {
      const c = consumers.get(agentId);
      if (c && c.isProcessing && c.currentMessageId === messageId) {
        log(agentId, `Drain timer fired for message ${messageId.slice(0, 8)}, forcing next`);
        // Assume it completed (engine may have sent the event and we missed it)
        try {
          await updateMessageStatus(agentId, messageId, 'completed');
        } catch { /* best-effort */ }
        c.isProcessing = false;
        c.currentMessageId = null;
        c.retryCount = 0;
        await tryProcessNext(agentId);
      }
    }, DRAIN_TIMEOUT_MS);

    return;
  }

  // Handle 409 — agent is busy (race condition, task still running)
  if (result.errorType === 'agent_busy') {
    log(agentId, `Agent busy (409), requeueing message ${messageId.slice(0, 8)}`);
    // Requeue: set back to pending
    await updateMessageStatus(agentId, messageId, 'pending');
    consumer.isProcessing = false;
    consumer.currentMessageId = null;

    // Retry after delay — the SSE listener should eventually pick up the completion
    setTimeout(async () => {
      if (consumers.has(agentId)) {
        await tryProcessNext(agentId);
      }
    }, BUSY_RETRY_DELAY_MS);
    return;
  }

  // Handle other recoverable errors with retry
  if (result.recoverable && consumer.retryCount < MAX_RETRIES) {
    consumer.retryCount++;
    const delay = RETRY_BACKOFF_BASE_MS * consumer.retryCount;
    log(agentId, `Retryable error (attempt ${consumer.retryCount}/${MAX_RETRIES}): ${result.error}`);

    setTimeout(async () => {
      if (consumers.has(agentId)) {
        await dispatchMessage(agentId, messageId, content, config);
      }
    }, delay);
    return;
  }

  // Non-recoverable or max retries exceeded — mark failed, try next
  log(agentId, `Message ${messageId.slice(0, 8)} failed permanently: ${result.error}`);
  await updateMessageStatus(agentId, messageId, 'failed');
  consumer.isProcessing = false;
  consumer.currentMessageId = null;
  consumer.retryCount = 0;

  // Try next message
  await tryProcessNext(agentId);
}

/**
 * Called from route handler after enqueue. If idle, picks up immediately.
 * If busy, no-op (SSE listener handles dispatch after current task).
 */
export async function notifyNewMessage(agentId: string): Promise<void> {
  await tryProcessNext(agentId);
}

/**
 * Called at API startup. Restarts consumers for any agents with status 'running'.
 */
export async function restartConsumersForRunningAgents(): Promise<void> {
  try {
    const agents = await listAgents();
    let started = 0;

    for (const agent of agents) {
      if (agent.status === 'running') {
        await startConsumer(agent.id);
        started++;
      }
    }

    if (started > 0) {
      console.log(`[QueueConsumer] Restarted consumers for ${started} running agent(s)`);
    }
  } catch (err) {
    console.error('[QueueConsumer] Error restarting consumers:', err);
  }
}
