import { Clock, Coins, MessageSquare } from 'lucide-react';
import type { ConversationTurn } from '../../types/agent';
import { ToolCallCard } from './ToolCallCard';
import { MarkdownContent } from '../../utils/markdown';

interface AssistantMessageProps {
  turn: ConversationTurn;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

export function AssistantMessage({ turn }: AssistantMessageProps) {
  const hasToolCalls = turn.toolCalls.length > 0;
  const hasText = turn.textContent.trim().length > 0;
  const hasUsage = turn.usage || turn.costUsd || turn.durationMs;

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] w-full">
        <div className="bg-[#12121a] rounded-2xl px-5 py-4 border border-[#1e1e3a]/50">
          {/* Text content */}
          {hasText && (
            <div className="text-[#e0e0e8] text-sm">
              <MarkdownContent text={turn.textContent} />
            </div>
          )}

          {/* Tool calls */}
          {hasToolCalls && (
            <div className={hasText ? 'mt-3' : ''}>
              {turn.toolCalls.map((tc) => (
                <ToolCallCard key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}

          {/* Streaming indicator */}
          {turn.isStreaming && (
            <div className="flex items-center gap-1.5 mt-3">
              <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
              <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse [animation-delay:150ms]" />
              <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse [animation-delay:300ms]" />
            </div>
          )}

          {/* Usage footer */}
          {hasUsage && !turn.isStreaming && (
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#1e1e3a]">
              {turn.durationMs !== undefined && (
                <div className="flex items-center gap-1 text-[10px] text-[#4a4a5e]">
                  <Clock className="w-3 h-3" />
                  {formatDuration(turn.durationMs)}
                </div>
              )}
              {turn.usage && (
                <div className="flex items-center gap-1 text-[10px] text-[#4a4a5e]">
                  <MessageSquare className="w-3 h-3" />
                  {(turn.usage.inputTokens + turn.usage.outputTokens).toLocaleString()} tokens
                </div>
              )}
              {turn.costUsd !== undefined && (
                <div className="flex items-center gap-1 text-[10px] text-[#4a4a5e]">
                  <Coins className="w-3 h-3" />
                  {formatCost(turn.costUsd)}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="text-[10px] text-[#4a4a5e] mt-1.5 px-2">
          {formatTime(turn.timestamp)}
        </div>
      </div>
    </div>
  );
}
