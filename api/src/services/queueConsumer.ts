import {
  dequeueAllMessages,
  updateMultipleMessageStatus,
  getAgent,
  listAgents,
  updateAgent,
} from './agents.js';
import { sendMessage } from './engine.js';
import { emitTeamEvent } from './teams.js';
import { createRun, completeRun, addAgentToRun } from './runs.js';
import { v4 as uuidv4 } from 'uuid';
import type { RuntimeConfig, Message, RunTriggerSource } from '../types.js';

// Per-agent consumer state
interface AgentConsumer {
  agentId: string;
  isProcessing: boolean;
  currentMessageIds: string[];  // Changed from single ID to array for batch
  currentRunId: string | null;  // Track current run for event correlation
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
// Safety drain timeout: generous safety net for missed SSE events (1 hour)
const DRAIN_TIMEOUT_MS = 3600000;

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
    currentMessageIds: [],
    currentRunId: null,
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

  // Reset any in-flight messages back to pending
  if (consumer.currentMessageIds.length > 0) {
    try {
      await updateMultipleMessageStatus(agentId, consumer.currentMessageIds, 'pending');
      log(agentId, `Reset ${consumer.currentMessageIds.length} message(s) back to pending`);
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

// Detect OAuth/auth errors that should trigger auto-pause
function isOAuthError(errorData: unknown): boolean {
  if (!errorData) return false;
  const errorStr = typeof errorData === 'string' ? errorData : JSON.stringify(errorData);
  const oauthPatterns = [
    'oauth',
    'authentication',
    'unauthorized',
    'invalid_grant',
    'token expired',
    'refresh token',
    'access_token',
    'credentials',
    '401',
    'UNAUTHENTICATED',
  ];
  const lowerError = errorStr.toLowerCase();
  return oauthPatterns.some(pattern => lowerError.includes(pattern.toLowerCase()));
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

    // Mark all batch messages as completed
    if (consumer.currentMessageIds.length > 0) {
      try {
        await updateMultipleMessageStatus(agentId, consumer.currentMessageIds, 'completed');
        log(agentId, `Batch of ${consumer.currentMessageIds.length} message(s) completed`);
      } catch (err) {
        console.error('[QueueConsumer] Failed to update message status:', err);
      }
    }

    // Complete the run if one is active
    const runId = consumer.currentRunId;
    if (runId) {
      try {
        const agent = await getAgent(agentId);
        if (agent?.teamId) {
          await completeRun(agent.teamId, runId, 'completed');
        }
      } catch { /* best-effort */ }
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
        }, runId || undefined);
      }
    } catch { /* best-effort */ }

    consumer.currentMessageIds = [];
    consumer.currentRunId = null;
    consumer.isProcessing = false;
    consumer.retryCount = 0;

    // Process next batch of queued messages
    await tryProcessNext(agentId);
  } else if (entry.type === 'agent_error') {
    log(agentId, 'Received agent_error event');

    // Clear drain timer
    if (consumer.drainTimer) {
      clearTimeout(consumer.drainTimer);
      consumer.drainTimer = null;
    }

    const runId = consumer.currentRunId;

    // Check if this is an OAuth error that should trigger auto-pause
    if (isOAuthError(entry.data)) {
      log(agentId, 'Detected OAuth/auth error, auto-pausing agent');
      try {
        const agent = await getAgent(agentId);
        if (agent) {
          // Update agent status to paused
          await updateAgent(agentId, {
            status: 'paused',
            pausedAt: new Date().toISOString(),
            pauseReason: 'oauth_expired',
            pausedMessageIds: consumer.currentMessageIds,
          });

          // Stop the consumer (but don't reset messages to pending - keep them for resume)
          if (consumer.sseAbortController) {
            consumer.sseAbortController.abort();
            consumer.sseAbortController = null;
          }

          // Emit agent_paused event
          if (agent.teamId) {
            await emitTeamEvent({
              id: uuidv4(),
              teamId: agent.teamId,
              type: 'agent_paused',
              timestamp: new Date().toISOString(),
              agentId,
              agentName: agent.name,
              data: { reason: 'oauth_expired', error: entry.data },
            }, runId || undefined);
          }

          // Complete the run as failed
          if (runId && agent.teamId) {
            await completeRun(agent.teamId, runId, 'failed');
          }

          consumer.currentMessageIds = [];
          consumer.currentRunId = null;
          consumer.isProcessing = false;
          consumers.delete(agentId);
          return;
        }
      } catch (err) {
        console.error('[QueueConsumer] Failed to auto-pause agent:', err);
      }
    }

    // Mark all batch messages as failed
    if (consumer.currentMessageIds.length > 0) {
      try {
        await updateMultipleMessageStatus(agentId, consumer.currentMessageIds, 'failed');
        log(agentId, `Batch of ${consumer.currentMessageIds.length} message(s) failed`);
      } catch (err) {
        console.error('[QueueConsumer] Failed to update message status:', err);
      }
    }

    // Complete the run as failed
    if (runId) {
      try {
        const agent = await getAgent(agentId);
        if (agent?.teamId) {
          await completeRun(agent.teamId, runId, 'failed');
        }
      } catch { /* best-effort */ }
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
        }, runId || undefined);
      }
    } catch { /* best-effort */ }

    consumer.currentMessageIds = [];
    consumer.currentRunId = null;
    consumer.isProcessing = false;
    consumer.retryCount = 0;

    // Process next batch of queued messages
    await tryProcessNext(agentId);
  }
}

/**
 * Format timestamp for display (e.g., "10:32 AM" or "Feb 22, 10:32 AM" if not today)
 */
function formatTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (isToday) {
    return timeStr;
  }

  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
  return `${dateStr}, ${timeStr}`;
}

/**
 * Format a single message with appropriate prefix based on type.
 */
function formatMessage(message: Message, index: number, total: number): string {
  let content = message.content;
  const timestamp = formatTimestamp(message.timestamp);

  // Add prefix based on message type
  if (message.role === 'agent' && message.metadata?.fromAgentName) {
    content = `[Message from agent "${message.metadata.fromAgentName}"]: ${content}`;
  } else if (message.metadata?.triggerType === 'cron') {
    content = `[Scheduled task "${message.metadata.cronJobName}"]: ${content}`;
  } else if (message.metadata?.source === 'mail') {
    const subject = message.metadata.subject || 'No subject';
    content = `[Mail - "${subject}"]: ${content}`;
  }

  // If multiple messages, number them and add timestamp
  if (total > 1) {
    return `[${index + 1}/${total}] (${timestamp}) ${content}`;
  }

  // Single message still gets timestamp
  return `(${timestamp}) ${content}`;
}

/**
 * Detect trigger source from messages metadata
 */
function detectTriggerSource(messages: Message[]): RunTriggerSource {
  // Check the first message for trigger hints
  const firstMessage = messages[0];
  if (!firstMessage) return 'manual';

  const metadata = firstMessage.metadata;
  if (metadata?.source === 'mail') return 'mail';
  if (metadata?.triggerType === 'cron') return 'cron';
  if (firstMessage.role === 'agent' && metadata?.fromAgentId) return 'intercom';

  return 'manual';
}

/**
 * Try to process all pending messages in the queue as a batch.
 * If already processing, this is a no-op (the SSE listener handles dispatch).
 */
export async function tryProcessNext(agentId: string): Promise<void> {
  const consumer = consumers.get(agentId);
  if (!consumer) return;

  // Already processing — SSE will trigger next dispatch
  if (consumer.isProcessing) return;

  // Dequeue ALL pending messages at once
  const messages = await dequeueAllMessages(agentId);
  if (messages.length === 0) return; // Nothing in queue

  consumer.isProcessing = true;
  consumer.currentMessageIds = messages.map(m => m.id);
  consumer.retryCount = 0;

  // Get agent config for sendMessage
  const agent = await getAgent(agentId);
  if (!agent) {
    log(agentId, 'Agent not found, marking batch failed');
    await updateMultipleMessageStatus(agentId, consumer.currentMessageIds, 'failed');
    consumer.isProcessing = false;
    consumer.currentMessageIds = [];
    return;
  }

  // Format all messages into a combined payload
  const formattedMessages = messages.map((msg, idx) => formatMessage(msg, idx, messages.length));

  let combinedContent: string;
  if (messages.length === 1) {
    combinedContent = formattedMessages[0];
  } else {
    // Multiple messages - create clear batch format
    combinedContent = `You have ${messages.length} messages in your queue:\n\n${formattedMessages.join('\n\n')}`;
  }

  log(agentId, `Dispatching batch of ${messages.length} message(s): "${combinedContent.slice(0, 80)}..."`);

  // Detect trigger source for potential run creation
  const triggerSource = detectTriggerSource(messages);
  const firstMessageId = messages[0]?.id;

  await dispatchBatch(agentId, consumer.currentMessageIds, combinedContent, agent.config, {
    teamId: agent.teamId,
    agentName: agent.name,
    triggerSource,
    firstMessageId,
    messageCount: messages.length,
  });
}

interface DispatchRunMeta {
  teamId?: string;
  agentName: string;
  triggerSource: RunTriggerSource;
  firstMessageId?: string;
  messageCount: number;
}

async function dispatchBatch(
  agentId: string,
  messageIds: string[],
  content: string,
  config: RuntimeConfig | undefined,
  runMeta: DispatchRunMeta
): Promise<void> {
  const consumer = consumers.get(agentId);
  if (!consumer) return;

  const result = await sendMessage(agentId, content, {
    sessionPersistence: true,
    config,
  });

  if (result.success) {
    log(agentId, `Batch of ${messageIds.length} message(s) dispatched to engine`);

    // NOW create the run - only after successful dispatch
    if (runMeta.teamId) {
      try {
        const run = await createRun({
          teamId: runMeta.teamId,
          triggerSource: runMeta.triggerSource,
          triggerAgentId: agentId,
          triggerAgentName: runMeta.agentName,
          metadata: {
            messageCount: runMeta.messageCount,
            firstMessageId: runMeta.firstMessageId,
          },
        });
        consumer.currentRunId = run.id;
        log(agentId, `Created run ${run.id} with trigger source: ${runMeta.triggerSource}`);

        // Emit team processing_started event
        await emitTeamEvent({
          id: uuidv4(),
          teamId: runMeta.teamId,
          type: 'processing_started',
          timestamp: new Date().toISOString(),
          agentId,
          agentName: runMeta.agentName,
          data: { messageCount: runMeta.messageCount },
        }, run.id);
      } catch (err) {
        console.error('[QueueConsumer] Failed to create run:', err);
      }
    }

    // Set safety drain timer in case SSE misses completion
    if (consumer.drainTimer) {
      clearTimeout(consumer.drainTimer);
    }
    consumer.drainTimer = setTimeout(async () => {
      const c = consumers.get(agentId);
      if (c && c.isProcessing && c.currentMessageIds.length > 0) {
        log(agentId, `Drain timer fired for batch of ${c.currentMessageIds.length} message(s), forcing next`);
        // Assume it completed (engine may have sent the event and we missed it)
        try {
          await updateMultipleMessageStatus(agentId, c.currentMessageIds, 'completed');
        } catch { /* best-effort */ }
        c.isProcessing = false;
        c.currentMessageIds = [];
        c.retryCount = 0;
        await tryProcessNext(agentId);
      }
    }, DRAIN_TIMEOUT_MS);

    return;
  }

  // Handle 409 — agent is busy (race condition, task still running)
  // NOTE: No run was created yet (run is only created on successful dispatch)
  // so we just requeue and wait for retry - no "failed" run to record
  if (result.errorType === 'agent_busy') {
    log(agentId, `Agent busy (409), requeueing batch of ${messageIds.length} message(s)`);
    // Requeue: set all back to pending
    await updateMultipleMessageStatus(agentId, messageIds, 'pending');

    consumer.isProcessing = false;
    consumer.currentMessageIds = [];
    consumer.currentRunId = null;

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
        await dispatchBatch(agentId, messageIds, content, config, runMeta);
      }
    }, delay);
    return;
  }

  // Non-recoverable or max retries exceeded — mark all failed, try next batch
  log(agentId, `Batch of ${messageIds.length} message(s) failed permanently: ${result.error}`);
  await updateMultipleMessageStatus(agentId, messageIds, 'failed');

  // Complete the run as failed
  const runId = consumer.currentRunId;
  if (runId) {
    try {
      const agent = await getAgent(agentId);
      if (agent?.teamId) {
        await completeRun(agent.teamId, runId, 'failed');
        log(agentId, `Completed run ${runId} as failed (dispatch error)`);

        // Emit processing_failed event
        await emitTeamEvent({
          id: uuidv4(),
          teamId: agent.teamId,
          type: 'processing_failed',
          timestamp: new Date().toISOString(),
          agentId,
          agentName: agent.name,
          data: { error: result.error },
        }, runId);
      }
    } catch { /* best-effort */ }
  }

  consumer.isProcessing = false;
  consumer.currentMessageIds = [];
  consumer.currentRunId = null;
  consumer.retryCount = 0;

  // Try next batch
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
