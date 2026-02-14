import { useState, useRef, useEffect } from 'react';
import { Send, Circle, Trash2, MessageSquare, ListTodo, RotateCcw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Agent, LogEntry, ConversationMessage } from '../types/agent';
import { sendMessage, sendConversationMessage, getSessionInfo, clearSession } from '../api/agents';
import { useAgentLogs } from '../hooks/useAgentLogs';

interface ActivityTabProps {
  agent: Agent;
}

type ActivityMode = 'task' | 'conversation';

function StatusIndicator({ status }: { status: Agent['status'] }) {
  const colors = {
    idle: 'text-green-500',
    processing: 'text-yellow-500',
    stopped: 'text-red-500',
  };

  const labels = {
    idle: 'Idle',
    processing: 'Processing',
    stopped: 'Stopped',
  };

  return (
    <div className="flex items-center gap-2">
      <Circle className={`w-3 h-3 fill-current ${colors[status]}`} />
      <span className="text-sm text-gray-400">{labels[status]}</span>
    </div>
  );
}

function LogEntryItem({ entry }: { entry: LogEntry }) {
  const typeColors = {
    system: 'text-blue-400',
    user: 'text-green-400',
    agent: 'text-purple-400',
    error: 'text-red-400',
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="flex gap-3 py-1 font-mono text-sm">
      <span className="text-gray-500 shrink-0">
        {formatTimestamp(entry.timestamp)}
      </span>
      <span className={`shrink-0 w-16 ${typeColors[entry.type]}`}>
        [{entry.type}]
      </span>
      <span className="text-gray-300 whitespace-pre-wrap break-words">
        {entry.message}
      </span>
    </div>
  );
}

function ChatMessage({ message }: { message: ConversationMessage }) {
  const isUser = message.role === 'user';

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-800 text-gray-100 border border-gray-700'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        <div
          className={`text-xs mt-2 ${
            isUser ? 'text-blue-200' : 'text-gray-500'
          }`}
        >
          {formatTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: ActivityMode;
  onModeChange: (mode: ActivityMode) => void;
}) {
  return (
    <div className="flex bg-gray-800 rounded-lg p-1">
      <button
        onClick={() => onModeChange('task')}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          mode === 'task'
            ? 'bg-gray-700 text-white'
            : 'text-gray-400 hover:text-gray-300'
        }`}
      >
        <ListTodo className="w-4 h-4" />
        Task Mode
      </button>
      <button
        onClick={() => onModeChange('conversation')}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          mode === 'conversation'
            ? 'bg-gray-700 text-white'
            : 'text-gray-400 hover:text-gray-300'
        }`}
      >
        <MessageSquare className="w-4 h-4" />
        Conversation
      </button>
    </div>
  );
}

function SessionToggle({
  sessionId,
  isEnabled,
  onToggle,
}: {
  sessionId: string | null;
  isEnabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          isEnabled ? 'bg-blue-600' : 'bg-gray-600'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            isEnabled ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
      <span className="text-sm text-gray-400">
        Session: {isEnabled ? (sessionId ? `${sessionId.slice(0, 8)}...` : 'Active') : 'Off'}
      </span>
    </div>
  );
}

export function ActivityTab({ agent }: ActivityTabProps) {
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<ActivityMode>('task');
  const [sessionEnabled, setSessionEnabled] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const queryClient = useQueryClient();
  const { logs, isConnected, error, clearLogs } = useAgentLogs(agent.id);

  // Fetch session info
  const { data: sessionInfo } = useQuery({
    queryKey: ['session', agent.id],
    queryFn: () => getSessionInfo(agent.id),
    refetchInterval: 10000,
  });

  // Update session state from server
  useEffect(() => {
    if (sessionInfo) {
      if (sessionInfo.sessionId) {
        setCurrentSessionId(sessionInfo.sessionId);
        setSessionEnabled(sessionInfo.active);
      }
    }
  }, [sessionInfo]);

  // Task mode message mutation
  const sendTaskMutation = useMutation({
    mutationFn: (msg: string) => sendMessage(agent.id, {
      message: msg,
      sessionId: sessionEnabled ? currentSessionId || undefined : undefined,
    }),
    onSuccess: () => {
      setMessage('');
    },
  });

  // Conversation mode message mutation
  const sendConversationMutation = useMutation({
    mutationFn: (msg: string) => sendConversationMessage(agent.id, msg, currentSessionId || undefined),
    onMutate: (msg) => {
      // Optimistically add user message
      const userMessage: ConversationMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: msg,
        timestamp: new Date().toISOString(),
      };
      setConversationMessages((prev) => [...prev, userMessage]);
      setMessage('');
    },
    onSuccess: (data) => {
      // Add assistant response
      const assistantMessage: ConversationMessage = {
        id: `response-${Date.now()}`,
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
      };
      setConversationMessages((prev) => [...prev, assistantMessage]);
      setCurrentSessionId(data.sessionId);
    },
    onError: () => {
      // Remove optimistic message on error
      setConversationMessages((prev) => prev.slice(0, -1));
    },
  });

  // Clear session mutation
  const clearSessionMutation = useMutation({
    mutationFn: () => clearSession(agent.id),
    onSuccess: () => {
      setCurrentSessionId(null);
      setConversationMessages([]);
      queryClient.invalidateQueries({ queryKey: ['session', agent.id] });
    },
  });

  // Auto-scroll to bottom when new logs/messages arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current && mode === 'task') {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, mode]);

  useEffect(() => {
    if (chatEndRef.current && mode === 'conversation') {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationMessages, mode]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (logsContainerRef.current && mode === 'task') {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    if (mode === 'task') {
      if (!sendTaskMutation.isPending) {
        sendTaskMutation.mutate(trimmedMessage);
      }
    } else {
      if (!sendConversationMutation.isPending) {
        sendConversationMutation.mutate(trimmedMessage);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleModeChange = (newMode: ActivityMode) => {
    setMode(newMode);
  };

  const handleSessionToggle = () => {
    setSessionEnabled(!sessionEnabled);
    if (sessionEnabled) {
      // Turning off - clear session ID but don't clear server session
      setCurrentSessionId(null);
    }
  };

  const handleClearSession = () => {
    clearSessionMutation.mutate();
  };

  const isPending = mode === 'task' ? sendTaskMutation.isPending : sendConversationMutation.isPending;
  const isError = mode === 'task' ? sendTaskMutation.isError : sendConversationMutation.isError;

  return (
    <div className="flex flex-col h-full">
      {/* Header with status and mode toggle */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <StatusIndicator status={agent.status} />
          <ModeToggle mode={mode} onModeChange={handleModeChange} />
        </div>
        <div className="flex items-center gap-4">
          {error && (
            <span className="text-sm text-red-400">{error}</span>
          )}
          {mode === 'task' && (
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className="text-xs text-gray-500">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          )}
          <button
            onClick={mode === 'task' ? clearLogs : handleClearSession}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title={mode === 'task' ? 'Clear logs' : 'Clear session'}
            disabled={clearSessionMutation.isPending}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Session controls - only in task mode */}
      {mode === 'task' && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900/50">
          <SessionToggle
            sessionId={currentSessionId}
            isEnabled={sessionEnabled}
            onToggle={handleSessionToggle}
          />
          {(sessionEnabled || currentSessionId) && (
            <button
              onClick={handleClearSession}
              disabled={clearSessionMutation.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              Clear Session
            </button>
          )}
        </div>
      )}

      {/* Conversation mode session indicator */}
      {mode === 'conversation' && currentSessionId && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-900/50">
          <span className="text-xs text-gray-500">
            Session: {currentSessionId.slice(0, 8)}...
          </span>
          <button
            onClick={handleClearSession}
            disabled={clearSessionMutation.isPending}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" />
            New Conversation
          </button>
        </div>
      )}

      {/* Content area - Task mode (log stream) */}
      {mode === 'task' && (
        <div
          ref={logsContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 bg-gray-950"
        >
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              No activity yet. Send a message to get started.
            </div>
          ) : (
            <>
              {logs.map((entry) => (
                <LogEntryItem key={entry.id} entry={entry} />
              ))}
              <div ref={logsEndRef} />
            </>
          )}
        </div>
      )}

      {/* Content area - Conversation mode (chat style) */}
      {mode === 'conversation' && (
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 bg-gray-950"
        >
          {conversationMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Start a conversation with the agent.
            </div>
          ) : (
            <>
              {conversationMessages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              {sendConversationMutation.isPending && (
                <div className="flex justify-start mb-4">
                  <div className="bg-gray-800 text-gray-400 rounded-lg px-4 py-3 border border-gray-700">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-75" />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-150" />
                      <span className="ml-2 text-sm">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </>
          )}
        </div>
      )}

      {/* Message input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <div className="flex gap-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'task'
                ? 'Send a task to the agent...'
                : 'Type a message...'
            }
            disabled={agent.status === 'stopped'}
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            rows={2}
          />
          <button
            type="submit"
            disabled={!message.trim() || isPending || agent.status === 'stopped'}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        {isError && (
          <p className="mt-2 text-sm text-red-400">
            Failed to send message. Please try again.
          </p>
        )}
      </form>
    </div>
  );
}
