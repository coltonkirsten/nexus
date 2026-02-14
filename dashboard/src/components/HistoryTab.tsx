import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  Coins,
  MessageSquare,
} from 'lucide-react';
import type { Agent } from '../types/agent';
import { getAgentHistory, type Invocation } from '../api/agents';

interface HistoryTabProps {
  agent: Agent;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) {
    return `$${usd.toFixed(4)}`;
  }
  return `$${usd.toFixed(3)}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + '...';
}

interface InvocationItemProps {
  invocation: Invocation;
}

function InvocationItem({ invocation }: InvocationItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusConfig = {
    success: {
      icon: CheckCircle,
      color: 'text-green-400',
      bgColor: 'bg-green-400/10',
      label: 'Success',
    },
    error: {
      icon: XCircle,
      color: 'text-red-400',
      bgColor: 'bg-red-400/10',
      label: 'Error',
    },
  };

  const status = statusConfig[invocation.status];
  const StatusIcon = status.icon;
  const totalTokens = invocation.tokenUsage.input + invocation.tokenUsage.output;

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800/50">
      {/* Collapsed view - clickable header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center gap-4 hover:bg-gray-700/50 transition-colors text-left"
      >
        {/* Expand/collapse indicator */}
        <div className="text-gray-400">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>

        {/* Status indicator */}
        <div className={`flex items-center gap-1.5 ${status.color}`}>
          <StatusIcon className="w-4 h-4" />
          <span className="text-xs font-medium">{status.label}</span>
        </div>

        {/* Timestamp */}
        <div className="text-sm text-gray-400 shrink-0">
          {formatTimestamp(invocation.timestamp)}
        </div>

        {/* Input preview */}
        <div className="flex-1 text-sm text-gray-300 truncate min-w-0">
          <span className="text-gray-500">Input: </span>
          {truncateText(invocation.input, 60)}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Duration */}
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            {formatDuration(invocation.durationMs)}
          </div>

          {/* Tokens */}
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <MessageSquare className="w-3.5 h-3.5" />
            {totalTokens.toLocaleString()}
          </div>

          {/* Cost */}
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Coins className="w-3.5 h-3.5" />
            {formatCost(invocation.costUsd)}
          </div>
        </div>
      </button>

      {/* Expanded view - full details */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-700 space-y-4">
          {/* Input section */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Input Message
            </h4>
            <div className="bg-gray-900 rounded-lg p-3 text-sm text-gray-300 font-mono whitespace-pre-wrap break-words">
              {invocation.input}
            </div>
          </div>

          {/* Result section */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Result
            </h4>
            <div
              className={`rounded-lg p-3 text-sm font-mono whitespace-pre-wrap break-words ${
                invocation.status === 'error'
                  ? 'bg-red-900/20 text-red-300 border border-red-800/50'
                  : 'bg-gray-900 text-gray-300'
              }`}
            >
              {invocation.result}
            </div>
          </div>

          {/* Detailed stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Duration</div>
              <div className="text-sm font-medium text-white">
                {formatDuration(invocation.durationMs)}
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Input Tokens</div>
              <div className="text-sm font-medium text-white">
                {invocation.tokenUsage.input.toLocaleString()}
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Output Tokens</div>
              <div className="text-sm font-medium text-white">
                {invocation.tokenUsage.output.toLocaleString()}
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Cost</div>
              <div className="text-sm font-medium text-white">
                {formatCost(invocation.costUsd)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function HistoryTab({ agent }: HistoryTabProps) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['agent-history', agent.id],
    queryFn: () => getAgentHistory(agent.id),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-4" />
          <p>Loading history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load history</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const invocations = data?.invocations ?? [];

  if (invocations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <Clock className="w-12 h-12 mx-auto mb-4 text-gray-600" />
          <p className="text-lg font-medium">No invocation history</p>
          <p className="mt-1 text-sm">
            Past agent invocations will appear here.
          </p>
        </div>
      </div>
    );
  }

  // Calculate summary stats
  const totalInvocations = invocations.length;
  const successCount = invocations.filter((i) => i.status === 'success').length;
  const totalCost = invocations.reduce((sum, i) => sum + i.costUsd, 0);
  const totalTokens = invocations.reduce(
    (sum, i) => sum + i.tokenUsage.input + i.tokenUsage.output,
    0
  );

  return (
    <div className="flex flex-col h-full">
      {/* Summary header */}
      <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/30">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-gray-500">Total: </span>
            <span className="text-white font-medium">{totalInvocations}</span>
          </div>
          <div>
            <span className="text-gray-500">Success: </span>
            <span className="text-green-400 font-medium">
              {successCount}/{totalInvocations}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Tokens: </span>
            <span className="text-white font-medium">
              {totalTokens.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Cost: </span>
            <span className="text-white font-medium">{formatCost(totalCost)}</span>
          </div>
        </div>
      </div>

      {/* Invocation list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {invocations.map((invocation) => (
          <InvocationItem key={invocation.id} invocation={invocation} />
        ))}
      </div>
    </div>
  );
}
