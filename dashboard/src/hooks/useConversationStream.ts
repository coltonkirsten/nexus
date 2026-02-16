import { useMemo } from 'react';
import type { RichLogEntry, ConversationTurn, ToolCall } from '../types/agent';

// Parse RichLogEntry[] into ConversationTurn[]
export function parseConversationTurns(logs: RichLogEntry[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentAssistant: ConversationTurn | null = null;
  // Map of tool_use id -> index in toolCalls for the current assistant turn
  const toolCallMap = new Map<string, number>();

  for (const log of logs) {
    const { type, data, timestamp } = log;

    // agent_start → create a user turn
    if (type === 'agent_start') {
      const d = data as { message?: string };
      if (d.message) {
        turns.push({
          id: `user-${timestamp}`,
          role: 'user',
          timestamp,
          userText: d.message,
          textContent: d.message,
          toolCalls: [],
        });
      }
      // Prepare for assistant response
      currentAssistant = null;
      toolCallMap.clear();
      continue;
    }

    // agent_message → parse Claude SDK message objects
    if (type === 'agent_message' && data && typeof data === 'object') {
      const msg = data as Record<string, unknown>;
      const msgType = msg.type as string | undefined;

      // System init messages — skip
      if (msgType === 'system') continue;

      // Assistant messages with content blocks
      if (msgType === 'assistant') {
        if (!currentAssistant) {
          currentAssistant = {
            id: `assistant-${timestamp}-${turns.length}`,
            role: 'assistant',
            timestamp,
            textContent: '',
            toolCalls: [],
            isStreaming: true,
          };
          turns.push(currentAssistant);
        }

        const message = msg.message as { content?: unknown[] } | undefined;
        const content = message?.content || msg.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block && typeof block === 'object') {
              const b = block as Record<string, unknown>;
              if (b.type === 'text' && typeof b.text === 'string') {
                if (currentAssistant.textContent) {
                  currentAssistant.textContent += '\n' + b.text;
                } else {
                  currentAssistant.textContent = b.text;
                }
              } else if (b.type === 'tool_use') {
                const tc: ToolCall = {
                  id: b.id as string,
                  name: b.name as string,
                  input: (b.input as Record<string, unknown>) || {},
                };
                toolCallMap.set(tc.id, currentAssistant.toolCalls.length);
                currentAssistant.toolCalls.push(tc);
              }
            }
          }
        }
        continue;
      }

      // Tool results
      if (msgType === 'tool_result' || msgType === 'user') {
        // tool results come as user messages with content array containing tool_result blocks
        const content = (msg.message as { content?: unknown[] })?.content || msg.content;
        if (Array.isArray(content) && currentAssistant) {
          for (const block of content) {
            if (block && typeof block === 'object') {
              const b = block as Record<string, unknown>;
              if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
                const idx = toolCallMap.get(b.tool_use_id);
                if (idx !== undefined && currentAssistant.toolCalls[idx]) {
                  // Extract text from content
                  let resultText = '';
                  if (typeof b.content === 'string') {
                    resultText = b.content;
                  } else if (Array.isArray(b.content)) {
                    resultText = (b.content as Array<{ text?: string }>)
                      .map(c => c.text || '')
                      .join('\n');
                  }
                  currentAssistant.toolCalls[idx].result = resultText;
                  currentAssistant.toolCalls[idx].isError = b.is_error === true;
                }
              }
            }
          }
        }
        continue;
      }

      // Result message — finalize the turn
      if (msgType === 'result') {
        if (currentAssistant) {
          currentAssistant.isStreaming = false;
          const usage = msg.usage as { input_tokens?: number; output_tokens?: number } | undefined;
          if (usage) {
            currentAssistant.usage = {
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
            };
          }
          if (typeof msg.total_cost_usd === 'number') {
            currentAssistant.costUsd = msg.total_cost_usd;
          }
          if (typeof msg.duration_ms === 'number') {
            currentAssistant.durationMs = msg.duration_ms;
          }
          // If we have a result text and no text content yet, use it
          if (typeof msg.result === 'string' && !currentAssistant.textContent) {
            currentAssistant.textContent = msg.result;
          }
        }
        currentAssistant = null;
        toolCallMap.clear();
        continue;
      }
    }

    // agent_complete — mark any remaining assistant as done
    if (type === 'agent_complete') {
      if (currentAssistant) {
        currentAssistant.isStreaming = false;
      }
      currentAssistant = null;
      toolCallMap.clear();
      continue;
    }

    // agent_error — create system message
    if (type === 'agent_error') {
      if (currentAssistant) {
        currentAssistant.isStreaming = false;
      }
      const d = data as { error?: string } | undefined;
      turns.push({
        id: `error-${timestamp}`,
        role: 'system',
        timestamp,
        textContent: d?.error || 'Agent error occurred',
        toolCalls: [],
      });
      currentAssistant = null;
      toolCallMap.clear();
      continue;
    }
  }

  return turns;
}

export function useConversationStream(logs: RichLogEntry[]) {
  const turns = useMemo(() => parseConversationTurns(logs), [logs]);

  const isAgentRunning = useMemo(() => {
    // Check if there's an agent_start without a corresponding agent_complete/error
    let running = false;
    for (const log of logs) {
      if (log.type === 'agent_start') running = true;
      if (log.type === 'agent_complete' || log.type === 'agent_error') running = false;
    }
    return running;
  }, [logs]);

  return { turns, isAgentRunning };
}
