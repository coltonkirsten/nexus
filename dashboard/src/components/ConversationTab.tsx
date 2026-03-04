import { useState, useRef, useEffect } from 'react';
import { Send, Circle, Trash2, Play, Square, Clock, XCircle } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import type { Agent } from '../types/agent';
import { sendMessage, clearSession, startAgent, stopAgent, cancelAgentTask, getTokenStats } from '../api/agents';

// Context window sizes for different models (in tokens)
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Claude models
  'claude-haiku-4-5-20251001': 200000,
  'claude-sonnet-4-6-20250514': 200000,
  'claude-sonnet-4-6': 200000,
  'claude-opus-4-6': 200000,
  // Gemini models
  'gemini-3.1-pro-preview': 2000000,
  'gemini-3-pro-preview': 2000000,
  'gemini-3-flash-preview': 1000000,
  'gemini-2.5-pro': 1000000,
  'gemini-2.5-flash': 1000000,
  'gemini-2.5-flash-lite': 128000,
  // OpenAI models
  'gpt-5.3-codex': 256000,
  'gpt-5.2': 256000,
  'gpt-5-mini': 128000,
  'o3-pro': 200000,
  'o3': 200000,
  'o4-mini': 128000,
  'o3-deep-research': 200000,
  'o4-mini-deep-research': 128000,
};

// Get context window for a model, with a default fallback
function getContextWindow(model?: string): number {
  if (!model) return 200000; // Default to 200k
  return MODEL_CONTEXT_WINDOWS[model] || 200000;
}
import { useAgentLogs } from '../hooks/useAgentLogs';
import { useConversationStream } from '../hooks/useConversationStream';
import { UserMessage } from './messages/UserMessage';
import { AssistantMessage } from './messages/AssistantMessage';
import { SystemMessage } from './messages/SystemMessage';

interface ConversationTabProps {
  agent: Agent;
}

function StatusIndicator({ status }: { status: Agent['status'] }) {
  const colors: Record<string, string> = {
    running: 'text-emerald-400',
    starting: 'text-yellow-400',
    stopping: 'text-yellow-400',
    stopped: 'text-red-400',
    error: 'text-red-400',
    created: 'text-[#4a4a5e]',
  };

  const labels: Record<string, string> = {
    running: 'Running',
    starting: 'Starting...',
    stopping: 'Stopping...',
    stopped: 'Stopped',
    error: 'Error',
    created: 'Created',
  };

  return (
    <div className="flex items-center gap-2">
      <Circle className={`w-2.5 h-2.5 fill-current ${colors[status] || 'text-[#4a4a5e]'}`} />
      <span className="text-xs text-[#7a7a8e]">{labels[status] || status}</span>
    </div>
  );
}

export function ConversationTab({ agent }: ConversationTabProps) {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const [queuedMessages, setQueuedMessages] = useState<Array<{ id: string; text: string }>>([]);

  const queryClient = useQueryClient();
  const { logs, isConnected, error, clearLogs } = useAgentLogs(agent.id);
  const { turns, isAgentRunning } = useConversationStream(logs);

  // Fetch token stats periodically when agent is running
  const { data: tokenStats } = useQuery({
    queryKey: ['tokenStats', agent.id],
    queryFn: () => getTokenStats(agent.id),
    enabled: agent.status === 'running',
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Calculate context window usage percentage
  const contextWindow = getContextWindow(agent.config?.model);
  const usedTokens = tokenStats?.totalTokens || 0;
  const usagePercent = Math.min(100, (usedTokens / contextWindow) * 100);

  const isRunning = agent.status === 'running';
  const isTransitioning = agent.status === 'starting' || agent.status === 'stopping';

  // Remove queued messages when they appear as user turns via agent_start logs
  const prevLogCountRef = useRef(0);
  useEffect(() => {
    if (logs.length <= prevLogCountRef.current) {
      prevLogCountRef.current = logs.length;
      return;
    }
    // Check new logs for agent_start events
    const newLogs = logs.slice(prevLogCountRef.current);
    prevLogCountRef.current = logs.length;

    for (const log of newLogs) {
      if (log.type === 'agent_start') {
        const data = log.data as { message?: string };
        if (data.message) {
          setQueuedMessages(prev => {
            const idx = prev.findIndex(q => q.text === data.message);
            if (idx !== -1) {
              const next = [...prev];
              next.splice(idx, 1);
              return next;
            }
            return prev;
          });
        }
      }
    }
  }, [logs]);

  // Start/stop mutations
  const startMutation = useMutation({
    mutationFn: () => startAgent(agent.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => stopAgent(agent.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  // Send message (fire-and-forget, watch SSE for response)
  const sendMutation = useMutation({
    mutationFn: (msg: string) => sendMessage(agent.id, { message: msg }),
    onSuccess: (_data, msg) => {
      // If agent is currently processing, show this as queued
      if (isAgentRunning) {
        setQueuedMessages(prev => [...prev, { id: crypto.randomUUID(), text: msg }]);
      }
      setMessage('');
    },
  });

  // Cancel running task
  const cancelMutation = useMutation({
    mutationFn: () => cancelAgentTask(agent.id),
  });

  // Clear session
  const clearSessionMutation = useMutation({
    mutationFn: () => clearSession(agent.id),
    onSuccess: () => {
      clearLogs();
      setQueuedMessages([]);
      queryClient.invalidateQueries({ queryKey: ['session', agent.id] });
    },
  });

  // Auto-scroll when turns change
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns, autoScroll]);

  // Scroll to bottom on initial load and when switching agents
  const lastAgentId = useRef(agent.id);
  const hasScrolledForAgent = useRef(false);
  const scrollAttemptsRef = useRef(0);

  // Reset when agent changes
  useEffect(() => {
    if (agent.id !== lastAgentId.current) {
      lastAgentId.current = agent.id;
      hasScrolledForAgent.current = false;
      scrollAttemptsRef.current = 0;
      setAutoScroll(true);
    }
  }, [agent.id]);

  // Scroll to bottom after turns load - retry a few times to handle async rendering
  useEffect(() => {
    if (turns.length > 0 && !hasScrolledForAgent.current && containerRef.current) {
      const scrollToBottom = () => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      };

      // Scroll immediately
      scrollToBottom();

      // Also scroll after short delays to catch late-rendering content
      const t1 = setTimeout(scrollToBottom, 50);
      const t2 = setTimeout(scrollToBottom, 150);
      const t3 = setTimeout(() => {
        scrollToBottom();
        hasScrolledForAgent.current = true;
      }, 300);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [agent.id, turns.length]);

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sendMutation.isPending || !isRunning) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#1e1e3a]">
        <div className="flex items-center gap-4">
          <StatusIndicator status={agent.status} />
          {isRunning ? (
            <button
              onClick={() => stopMutation.mutate()}
              disabled={isTransitioning || stopMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-800/50 rounded-xl transition-all duration-200 disabled:opacity-50"
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          ) : (
            <button
              onClick={() => startMutation.mutate()}
              disabled={isTransitioning || startMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-800/50 rounded-xl transition-all duration-200 disabled:opacity-50"
            >
              <Play className="w-3 h-3" />
              Start
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {error && (
            <span className="text-xs text-red-400">{error}</span>
          )}
          {/* Context window usage */}
          {isRunning && tokenStats && (
            <div className="flex items-center gap-2" title={`${usedTokens.toLocaleString()} / ${contextWindow.toLocaleString()} tokens`}>
              <div className="w-16 h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    usagePercent >= 90 ? 'bg-red-500' :
                    usagePercent >= 70 ? 'bg-yellow-500' :
                    'bg-indigo-500'
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium ${
                usagePercent >= 90 ? 'text-red-400' :
                usagePercent >= 70 ? 'text-yellow-400' :
                'text-[#4a4a5e]'
              }`}>
                {usagePercent.toFixed(0)}%
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-[10px] text-[#4a4a5e]">
              {isConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
          <button
            onClick={() => {
              clearLogs();
              clearSessionMutation.mutate();
            }}
            className="p-1.5 text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
            title="Clear conversation"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-6"
      >
        {turns.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-[#1e1e3a] text-6xl mb-4 font-bold select-none">{'>'}_</div>
              <p className="text-[#4a4a5e] text-sm">Send a message to start a conversation</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {turns.map((turn) => {
              switch (turn.role) {
                case 'user':
                  return <UserMessage key={turn.id} turn={turn} />;
                case 'assistant':
                  return <AssistantMessage key={turn.id} turn={turn} />;
                case 'system':
                  return <SystemMessage key={turn.id} turn={turn} />;
                default:
                  return null;
              }
            })}
            {/* Queued messages */}
            {queuedMessages.map((qm) => (
              <div
                key={qm.id}
                className="flex justify-end"
              >
                <div className="max-w-[80%] px-4 py-3 rounded-xl border border-dashed border-[#2a2a4a] bg-[#0f0f18]/50 text-[#7a7a8e]">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-3 h-3 text-yellow-500/70" />
                    <span className="text-[10px] font-medium text-yellow-500/70 uppercase tracking-wider">Queued</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{qm.text}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="px-6 py-4 border-t border-[#1e1e3a]">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isRunning ? 'Send a message...' : 'Start the agent to send messages'}
                disabled={!isRunning}
                className="w-full px-4 py-3 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] placeholder-[#4a4a5e] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 resize-none disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 text-sm"
                rows={2}
              />
              {isAgentRunning && (
                <button
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="absolute right-3 top-3 flex items-center gap-1 px-2 py-1 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all duration-200 disabled:opacity-50"
                  title="Cancel running task"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-medium">Cancel</span>
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!message.trim() || sendMutation.isPending || !isRunning}
              className="px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          {queuedMessages.length > 0 && (
            <p className="mt-2 text-xs text-yellow-500/70 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {queuedMessages.length} message{queuedMessages.length !== 1 ? 's' : ''} queued
            </p>
          )}
          {sendMutation.isError && (
            <p className="mt-2 text-xs text-red-400">
              Failed to send message. Please try again.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
