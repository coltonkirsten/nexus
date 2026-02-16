import { useState, useRef, useEffect } from 'react';
import { Send, Circle, Trash2, Play, Square, RotateCcw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Agent } from '../types/agent';
import { sendMessage, getSessionInfo, clearSession, startAgent, stopAgent } from '../api/agents';
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
    idle: 'text-emerald-400',
    running: 'text-emerald-400',
    processing: 'text-yellow-400',
    starting: 'text-yellow-400',
    stopping: 'text-yellow-400',
    stopped: 'text-red-400',
    error: 'text-red-400',
    created: 'text-[#4a4a5e]',
  };

  const labels: Record<string, string> = {
    idle: 'Idle',
    running: 'Running',
    processing: 'Processing',
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
  const [sessionEnabled, setSessionEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const queryClient = useQueryClient();
  const { logs, isConnected, error, clearLogs } = useAgentLogs(agent.id);
  const { turns, isAgentRunning } = useConversationStream(logs);

  const isRunning = agent.status === 'running' || agent.status === 'idle' || agent.status === 'processing';
  const isTransitioning = agent.status === 'starting' || agent.status === 'stopping';

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

  // Session info
  const { data: sessionInfo } = useQuery({
    queryKey: ['session', agent.id],
    queryFn: () => getSessionInfo(agent.id),
    refetchInterval: 10000,
    enabled: isRunning,
  });

  // Send message (fire-and-forget, watch SSE for response)
  const sendMutation = useMutation({
    mutationFn: (msg: string) => sendMessage(agent.id, { message: msg }),
    onSuccess: () => {
      setMessage('');
    },
  });

  // Clear session
  const clearSessionMutation = useMutation({
    mutationFn: () => clearSession(agent.id),
    onSuccess: () => {
      clearLogs();
      queryClient.invalidateQueries({ queryKey: ['session', agent.id] });
    },
  });

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns, autoScroll]);

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
          {/* Session toggle */}
          <button
            onClick={() => setSessionEnabled(!sessionEnabled)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-all duration-200 ${
              sessionEnabled
                ? 'text-indigo-400 bg-indigo-500/10'
                : 'text-[#4a4a5e] hover:text-[#7a7a8e]'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${sessionEnabled ? 'bg-indigo-400' : 'bg-[#4a4a5e]'}`} />
            Session {sessionEnabled ? (sessionInfo?.sessionId ? `${sessionInfo.sessionId.slice(0, 6)}` : 'On') : 'Off'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          {error && (
            <span className="text-xs text-red-400">{error}</span>
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
            title="Clear session"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => clearSessionMutation.mutate()}
            className="p-1.5 text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
            title="New session"
          >
            <RotateCcw className="w-3.5 h-3.5" />
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
                <div className="absolute right-3 top-3 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                  <span className="text-[10px] text-indigo-400">Processing</span>
                </div>
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
