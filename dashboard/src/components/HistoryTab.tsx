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

  const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; bgColor: string; label: string }> = {
    success: {
      icon: CheckCircle,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-400/10',
      label: 'Success',
    },
    error: {
      icon: XCircle,
      color: 'text-red-400',
      bgColor: 'bg-red-400/10',
      label: 'Error',
    },
    running: {
      icon: Clock,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-400/10',
      label: 'Running',
    },
  };

  const status = statusConfig[invocation.status] || statusConfig.running;
  const StatusIcon = status.icon;
  const totalTokens = invocation.tokenUsage.input + invocation.tokenUsage.output;

  return (
    <div className="border border-[#1e1e3a] rounded-xl overflow-hidden bg-[#12121a]">
      {/* Collapsed view - clickable header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center gap-4 hover:bg-[#1a1a2e] transition-all duration-200 text-left"
      >
        <div className="text-[#4a4a5e]">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>

        <div className={`flex items-center gap-1.5 ${status.color}`}>
          <StatusIcon className="w-4 h-4" />
          <span className="text-xs font-medium">{status.label}</span>
        </div>

        <div className="text-sm text-[#7a7a8e] shrink-0">
          {formatTimestamp(invocation.timestamp)}
        </div>

        <div className="flex-1 text-sm text-[#e0e0e8] truncate min-w-0">
          <span className="text-[#4a4a5e]">Input: </span>
          {truncateText(invocation.input, 60)}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1 text-xs text-[#7a7a8e]">
            <Clock className="w-3.5 h-3.5" />
            {formatDuration(invocation.durationMs)}
          </div>
          <div className="flex items-center gap-1 text-xs text-[#7a7a8e]">
            <MessageSquare className="w-3.5 h-3.5" />
            {totalTokens.toLocaleString()}
          </div>
          <div className="flex items-center gap-1 text-xs text-[#7a7a8e]">
            <Coins className="w-3.5 h-3.5" />
            {formatCost(invocation.costUsd)}
          </div>
        </div>
      </button>

      {/* Expanded view */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-[#1e1e3a] space-y-4">
          <div>
            <h4 className="text-xs font-medium text-[#4a4a5e] uppercase tracking-wide mb-2">
              Input Message
            </h4>
            <div className="bg-[#0a0a0f] rounded-xl p-3 text-sm text-[#e0e0e8] font-mono whitespace-pre-wrap break-words border border-[#1e1e3a]">
              {invocation.input}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-medium text-[#4a4a5e] uppercase tracking-wide mb-2">
              Result
            </h4>
            <div
              className={`rounded-xl p-3 text-sm font-mono whitespace-pre-wrap break-words border ${
                invocation.status === 'error'
                  ? 'bg-red-900/20 text-red-300 border-red-800/50'
                  : 'bg-[#0a0a0f] text-[#e0e0e8] border-[#1e1e3a]'
              }`}
            >
              {invocation.result}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <div className="bg-[#0a0a0f] rounded-xl p-3 border border-[#1e1e3a]">
              <div className="text-xs text-[#4a4a5e] mb-1">Duration</div>
              <div className="text-sm font-medium text-[#e0e0e8]">
                {formatDuration(invocation.durationMs)}
              </div>
            </div>
            <div className="bg-[#0a0a0f] rounded-xl p-3 border border-[#1e1e3a]">
              <div className="text-xs text-[#4a4a5e] mb-1">Input Tokens</div>
              <div className="text-sm font-medium text-[#e0e0e8]">
                {invocation.tokenUsage.input.toLocaleString()}
              </div>
            </div>
            <div className="bg-[#0a0a0f] rounded-xl p-3 border border-[#1e1e3a]">
              <div className="text-xs text-[#4a4a5e] mb-1">Output Tokens</div>
              <div className="text-sm font-medium text-[#e0e0e8]">
                {invocation.tokenUsage.output.toLocaleString()}
              </div>
            </div>
            <div className="bg-[#0a0a0f] rounded-xl p-3 border border-[#1e1e3a]">
              <div className="text-xs text-[#4a4a5e] mb-1">Cost</div>
              <div className="text-sm font-medium text-[#e0e0e8]">
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
      <div className="flex items-center justify-center h-full text-[#4a4a5e]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400 mx-auto mb-4" />
          <p>Loading history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[#4a4a5e]">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load history</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-[#1a1a2e] hover:bg-[#2a2a4a] rounded-xl text-sm text-[#e0e0e8] transition-all duration-200"
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
      <div className="flex items-center justify-center h-full text-[#4a4a5e]">
        <div className="text-center">
          <Clock className="w-12 h-12 mx-auto mb-4 text-[#1e1e3a]" />
          <p className="text-lg font-medium text-[#7a7a8e]">No invocation history</p>
          <p className="mt-1 text-sm">
            Past agent invocations will appear here.
          </p>
        </div>
      </div>
    );
  }

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
      <div className="px-4 py-3 border-b border-[#1e1e3a] bg-[#12121a]">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-[#4a4a5e]">Total: </span>
            <span className="text-[#e0e0e8] font-medium">{totalInvocations}</span>
          </div>
          <div>
            <span className="text-[#4a4a5e]">Success: </span>
            <span className="text-emerald-400 font-medium">
              {successCount}/{totalInvocations}
            </span>
          </div>
          <div>
            <span className="text-[#4a4a5e]">Tokens: </span>
            <span className="text-[#e0e0e8] font-medium">
              {totalTokens.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-[#4a4a5e]">Cost: </span>
            <span className="text-[#e0e0e8] font-medium">{formatCost(totalCost)}</span>
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
