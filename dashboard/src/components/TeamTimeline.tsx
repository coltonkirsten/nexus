import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ZoomIn,
  ZoomOut,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Play,
  MessageSquare,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  DollarSign,
  Wrench,
  User,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  AlertCircle,
  Bot,
} from 'lucide-react';
import type { Run } from '../types/agent';
import { getTeamTimeline } from '../api/teams';

interface TeamTimelineProps {
  teamId: string;
}

// Zoom levels in milliseconds - allows continuous zooming
const MIN_ZOOM_MS = 5 * 60 * 1000; // 5 minutes minimum
const MAX_ZOOM_MS = 30 * 24 * 60 * 60 * 1000; // 30 days maximum
const ZOOM_FACTOR = 1.5; // How much to zoom in/out per click

const statusColors: Record<string, string> = {
  running: 'bg-yellow-500',
  active: 'bg-yellow-500',
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-500',
  pending: 'bg-blue-500',
};

const statusBorderColors: Record<string, string> = {
  running: 'border-yellow-400',
  active: 'border-yellow-400',
  completed: 'border-emerald-400',
  failed: 'border-red-400',
  cancelled: 'border-gray-400',
  pending: 'border-blue-400',
};

const triggerIcons: Record<string, typeof Play> = {
  mail: MessageSquare,
  cron: Clock,
  manual: User,
  intercom: Zap,
  user: User,
  api: Zap,
};

function formatTimeMarker(date: Date, zoomMs: number): string {
  if (zoomMs <= 60 * 60 * 1000) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  if (zoomMs <= 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDuration(zoomMs: number): string {
  if (zoomMs < 60 * 1000) return `${Math.round(zoomMs / 1000)}s`;
  if (zoomMs < 60 * 60 * 1000) return `${Math.round(zoomMs / (60 * 1000))}m`;
  if (zoomMs < 24 * 60 * 60 * 1000) return `${(zoomMs / (60 * 60 * 1000)).toFixed(1)}h`;
  return `${(zoomMs / (24 * 60 * 60 * 1000)).toFixed(1)}d`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

// Log entry types
interface LogContentItem {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
}

interface LogEntry {
  type: string;
  timestamp?: string;
  // The actual data is nested in `data` field from the API
  data?: {
    type?: string;
    message?: {
      role?: string;
      content?: LogContentItem[];
    };
    result?: string;
    is_error?: boolean;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
    line?: string; // For cli_stderr/cli_stdout
  };
  // Legacy/direct fields
  message?: {
    role?: string;
    content?: LogContentItem[];
  };
  role?: string;
  content?: unknown;
}

interface RunDetailPanelProps {
  run: Run;
  onClose: () => void;
  agentId: string;
}

function RunDetailPanel({ run, onClose, agentId }: RunDetailPanelProps) {
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());

  // Fetch raw logs for this agent
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['agent-raw-logs', agentId],
    queryFn: async () => {
      const response = await fetch(`/api/agents/${agentId}/logs/raw`);
      if (!response.ok) return [];
      return response.json() as Promise<LogEntry[]>;
    },
    enabled: !!agentId,
  });

  // Filter logs to only those within this run's time range
  const runLogs = useMemo(() => {
    if (!logsData || !Array.isArray(logsData)) return [];

    const runStart = new Date(run.startedAt).getTime();
    const runEnd = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();

    return logsData.filter((log) => {
      if (!log.timestamp) return false;
      const logTime = new Date(log.timestamp).getTime();
      return logTime >= runStart && logTime <= runEnd;
    });
  }, [logsData, run.startedAt, run.completedAt]);

  const TriggerIcon = triggerIcons[run.trigger] || Zap;
  const statusColor = statusColors[run.status] || 'bg-gray-500';

  const toggleEntry = (index: number) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const renderLogContent = (content: LogContentItem[] | undefined) => {
    if (!content || !Array.isArray(content)) return null;

    return content.map((item, idx) => {
      if (item.type === 'text' && item.text) {
        return (
          <div key={idx} className="text-xs text-[#e0e0e8] whitespace-pre-wrap">
            {item.text}
          </div>
        );
      }
      if (item.type === 'tool_use') {
        return (
          <div key={idx} className="space-y-1">
            <div className="flex items-center gap-2">
              <Wrench className="w-3 h-3 text-indigo-400" />
              <span className="text-xs font-medium text-indigo-400">{item.name}</span>
              <span className="text-[10px] text-[#4a4a5e]">({item.id})</span>
            </div>
            {item.input !== undefined ? (
              <pre className="text-[10px] text-[#7a7a8e] bg-[#0a0a0f] rounded p-2 overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(item.input, null, 2)}
              </pre>
            ) : null}
          </div>
        );
      }
      if (item.type === 'tool_result') {
        const resultContent = item.content || '';
        const isError = resultContent.toString().toLowerCase().includes('error');
        return (
          <div key={idx} className="space-y-1">
            <div className="flex items-center gap-2">
              {isError ? (
                <XCircle className="w-3 h-3 text-red-400" />
              ) : (
                <CheckCircle className="w-3 h-3 text-emerald-400" />
              )}
              <span className="text-xs text-[#7a7a8e]">Tool Result</span>
              <span className="text-[10px] text-[#4a4a5e]">({item.tool_use_id})</span>
            </div>
            <pre className="text-[10px] text-[#7a7a8e] bg-[#0a0a0f] rounded p-2 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
              {typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent, null, 2)}
            </pre>
          </div>
        );
      }
      return null;
    });
  };

  // Render a single log entry with proper format handling
  const renderLogEntry = (log: LogEntry) => {
    // Handle nested data format from API
    const data = log.data;

    // Handle cli_stderr/cli_stdout (raw output lines)
    if (log.type === 'cli_stderr' || log.type === 'cli_stdout') {
      const line = data?.line || '';
      return (
        <pre className="text-[10px] text-[#7a7a8e] bg-[#0a0a0f] rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono">
          {line}
        </pre>
      );
    }

    // Handle agent_message type
    if (log.type === 'agent_message' && data) {
      // Result type (final output)
      if (data.type === 'result') {
        return (
          <div className="space-y-2">
            {data.result ? (
              <pre className="text-xs text-[#e0e0e8] bg-[#0a0a0f] rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {data.result}
              </pre>
            ) : null}
            {data.is_error ? (
              <div className="flex items-center gap-2 text-red-400">
                <XCircle className="w-3 h-3" />
                <span className="text-xs">Error</span>
              </div>
            ) : null}
            {data.usage ? (
              <div className="flex items-center gap-4 text-[10px] text-[#4a4a5e]">
                <span>{data.usage.input_tokens?.toLocaleString()} input tokens</span>
                <span>{data.usage.output_tokens?.toLocaleString()} output tokens</span>
              </div>
            ) : null}
          </div>
        );
      }

      // Message with content array
      if (data.message?.content) {
        return renderLogContent(data.message.content);
      }
    }

    // Fallback: show raw data
    if (data) {
      return (
        <pre className="text-[10px] text-[#7a7a8e] bg-[#0a0a0f] rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
    }

    return <span className="text-xs text-[#4a4a5e]">No content</span>;
  };

  const getLogIcon = (log: LogEntry) => {
    // Handle nested data format
    const dataType = log.data?.type;
    const role = log.data?.message?.role || log.message?.role || log.role;

    if (log.type === 'cli_stderr') return <AlertCircle className="w-3.5 h-3.5 text-yellow-400" />;
    if (log.type === 'cli_stdout') return <MessageSquare className="w-3.5 h-3.5 text-[#4a4a5e]" />;
    if (dataType === 'result') return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
    if (dataType === 'assistant' || role === 'assistant') return <Bot className="w-3.5 h-3.5 text-indigo-400" />;
    if (dataType === 'user' || role === 'user') return <User className="w-3.5 h-3.5 text-emerald-400" />;
    return <MessageSquare className="w-3.5 h-3.5 text-[#4a4a5e]" />;
  };

  const getLogSummary = (log: LogEntry): string => {
    // Handle cli_stderr/stdout
    if (log.type === 'cli_stderr' || log.type === 'cli_stdout') {
      const line = log.data?.line || '';
      return line.length > 50 ? line.substring(0, 50) + '...' : line || 'Output';
    }

    // Handle result type
    if (log.data?.type === 'result') {
      if (log.data.is_error) return 'Error result';
      return log.data.result ? 'Completion' : 'Task completed';
    }

    // Handle message content
    const content = log.data?.message?.content || log.message?.content;
    if (!content || !Array.isArray(content)) {
      // Show the data type if available
      if (log.data?.type) return log.data.type;
      return log.type || 'Log entry';
    }

    for (const item of content) {
      if (item.type === 'tool_use' && item.name) {
        return `Tool: ${item.name}`;
      }
      if (item.type === 'tool_result') {
        const preview = item.content || '';
        const previewStr = typeof preview === 'string' ? preview : '';
        return previewStr.length > 40 ? `Result: ${previewStr.substring(0, 40)}...` : `Result: ${previewStr || 'OK'}`;
      }
      if (item.type === 'text' && item.text) {
        const text = item.text.trim();
        return text.length > 50 ? text.substring(0, 50) + '...' : text;
      }
    }
    return log.type || 'Log entry';
  };

  return (
    <div className="bg-[#12121a] h-full flex flex-col w-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-[#1e1e3a] shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${statusColor} flex items-center justify-center`}>
            <TriggerIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#e0e0e8]">{run.agentName}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor} text-white`}>
                {run.status}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-[#7a7a8e] capitalize">{run.trigger} triggered</span>
              <span className="text-[#3a3a4e]">•</span>
              <span className="text-xs text-[#4a4a5e]">{formatTimestamp(run.startedAt)}</span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-6 px-4 py-3 border-b border-[#1e1e3a] bg-[#0f0f18]">
        {run.durationMs !== undefined && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#4a4a5e]" />
            <span className="text-xs text-[#e0e0e8]">{formatMs(run.durationMs)}</span>
          </div>
        )}
        {run.tokenUsage && (
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-[#4a4a5e]" />
            <span className="text-xs text-[#e0e0e8]">
              {run.tokenUsage.input.toLocaleString()} in / {run.tokenUsage.output.toLocaleString()} out
            </span>
          </div>
        )}
        {run.costUsd !== undefined && (
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-emerald-400">${run.costUsd.toFixed(4)}</span>
          </div>
        )}
      </div>

      {/* Input/Output previews */}
      {(run.inputPreview || run.outputPreview || run.error) && (
        <div className="px-4 py-3 border-b border-[#1e1e3a] space-y-3">
          {run.inputPreview && (
            <div className="space-y-1">
              <span className="text-[10px] text-[#4a4a5e] uppercase tracking-wide">Input</span>
              <p className="text-xs text-[#7a7a8e] line-clamp-2">{run.inputPreview}</p>
            </div>
          )}
          {run.outputPreview && (
            <div className="space-y-1">
              <span className="text-[10px] text-[#4a4a5e] uppercase tracking-wide">Output</span>
              <p className="text-xs text-[#e0e0e8] line-clamp-2">{run.outputPreview}</p>
            </div>
          )}
          {run.error && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 text-red-400" />
                <span className="text-[10px] text-red-400 uppercase tracking-wide">Error</span>
              </div>
              <p className="text-xs text-red-300">{run.error}</p>
            </div>
          )}
        </div>
      )}

      {/* Execution logs */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 bg-[#0a0a0f] border-b border-[#1e1e3a] sticky top-0">
          <span className="text-[10px] text-[#4a4a5e] uppercase tracking-wide">
            Execution Log ({runLogs.length} entries)
          </span>
        </div>

        {logsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
        ) : runLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="w-8 h-8 text-[#2a2a4a] mb-2" />
            <p className="text-xs text-[#4a4a5e]">No logs available for this run</p>
            <p className="text-[10px] text-[#3a3a4e] mt-1">Logs may have been cleared or the agent wasn't running</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1e1e3a]">
            {runLogs.map((log, index) => {
              const isExpanded = expandedEntries.has(index);
              const summary = getLogSummary(log);

              return (
                <div key={index} className="hover:bg-[#0f0f18] transition-colors">
                  <button
                    onClick={() => toggleEntry(index)}
                    className="w-full px-4 py-2 flex items-center gap-3 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-[#4a4a5e] shrink-0" />
                    ) : (
                      <ChevronRightIcon className="w-3 h-3 text-[#4a4a5e] shrink-0" />
                    )}
                    {getLogIcon(log)}
                    <span className="text-xs text-[#7a7a8e] truncate flex-1">{summary}</span>
                    {log.timestamp && (
                      <span className="text-[10px] text-[#3a3a4e] shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false,
                        })}
                      </span>
                    )}
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 pl-10 space-y-2">
                      {renderLogEntry(log)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface TimeAxisProps {
  start: Date;
  end: Date;
  zoomMs: number;
  width: number;
}

function TimeAxis({ start, end, zoomMs, width }: TimeAxisProps) {
  const markers = useMemo(() => {
    const result: Array<{ position: number; label: string }> = [];
    const totalMs = end.getTime() - start.getTime();

    let intervalMs: number;
    if (zoomMs <= 10 * 60 * 1000) intervalMs = 1 * 60 * 1000;
    else if (zoomMs <= 30 * 60 * 1000) intervalMs = 5 * 60 * 1000;
    else if (zoomMs <= 2 * 60 * 60 * 1000) intervalMs = 15 * 60 * 1000;
    else if (zoomMs <= 6 * 60 * 60 * 1000) intervalMs = 60 * 60 * 1000;
    else if (zoomMs <= 24 * 60 * 60 * 1000) intervalMs = 2 * 60 * 60 * 1000;
    else if (zoomMs <= 7 * 24 * 60 * 60 * 1000) intervalMs = 24 * 60 * 60 * 1000;
    else intervalMs = 7 * 24 * 60 * 60 * 1000;

    const firstMarker = new Date(Math.ceil(start.getTime() / intervalMs) * intervalMs);

    for (let time = firstMarker.getTime(); time < end.getTime(); time += intervalMs) {
      const position = ((time - start.getTime()) / totalMs) * width;
      result.push({
        position,
        label: formatTimeMarker(new Date(time), zoomMs),
      });
    }

    return result;
  }, [start, end, zoomMs, width]);

  return (
    <div className="relative h-6 border-b border-[#1e1e3a]">
      {markers.map((marker, i) => (
        <div
          key={i}
          className="absolute flex flex-col items-center"
          style={{ left: marker.position }}
        >
          <div className="w-px h-2 bg-[#2a2a4a]" />
          <span className="text-[9px] text-[#4a4a5e] whitespace-nowrap">{marker.label}</span>
        </div>
      ))}
    </div>
  );
}

interface AgentSwimlaneProps {
  agentId: string;
  agentName: string;
  runs: Run[];
  start: Date;
  end: Date;
  width: number;
  selectedRunId: string | null;
  onRunClick: (run: Run) => void;
}

// Calculate row assignments for overlapping runs
function assignRunRows(runs: Run[]): Map<string, number> {
  const rowAssignments = new Map<string, number>();
  if (runs.length === 0) return rowAssignments;

  // Sort runs by start time
  const sortedRuns = [...runs].sort((a, b) =>
    new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );

  // Track end times for each row
  const rowEndTimes: number[] = [];

  for (const run of sortedRuns) {
    const runStart = new Date(run.startedAt).getTime();
    const runEnd = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();

    // Find the first row where this run fits (doesn't overlap)
    let assignedRow = -1;
    for (let i = 0; i < rowEndTimes.length; i++) {
      if (rowEndTimes[i] <= runStart) {
        assignedRow = i;
        rowEndTimes[i] = runEnd;
        break;
      }
    }

    // If no existing row fits, create a new one
    if (assignedRow === -1) {
      assignedRow = rowEndTimes.length;
      rowEndTimes.push(runEnd);
    }

    rowAssignments.set(run.id, assignedRow);
  }

  return rowAssignments;
}

const ROW_HEIGHT = 28; // Height of each row in pixels
const ROW_GAP = 4; // Gap between rows

function AgentSwimlane({
  agentName,
  runs,
  start,
  end,
  width,
  selectedRunId,
  onRunClick,
}: AgentSwimlaneProps) {
  const totalMs = end.getTime() - start.getTime();

  const getPosition = useCallback(
    (timestamp: string) => {
      const eventTime = new Date(timestamp).getTime();
      return ((eventTime - start.getTime()) / totalMs) * width;
    },
    [start, totalMs, width]
  );

  const getBarWidth = useCallback(
    (startTs: string, endTs: string | undefined) => {
      const startTime = new Date(startTs).getTime();
      const endTime = endTs ? new Date(endTs).getTime() : Date.now();
      const duration = endTime - startTime;
      const barWidth = (duration / totalMs) * width;
      // Minimum width of 8px so it's clickable
      return Math.max(8, barWidth);
    },
    [totalMs, width]
  );

  // Calculate row assignments to prevent overlaps
  const rowAssignments = useMemo(() => assignRunRows(runs), [runs]);
  const maxRow = useMemo(() => {
    let max = 0;
    rowAssignments.forEach((row) => {
      if (row > max) max = row;
    });
    return max;
  }, [rowAssignments]);

  // Calculate swimlane height based on number of rows needed
  const swimlaneHeight = Math.max(40, (maxRow + 1) * (ROW_HEIGHT + ROW_GAP) + ROW_GAP);

  return (
    <div className="flex border-b border-[#1e1e3a] group">
      {/* Agent name */}
      <div
        className="w-32 shrink-0 px-3 py-2 bg-[#0f0f18] border-r border-[#1e1e3a] flex items-center"
        style={{ minHeight: swimlaneHeight }}
      >
        <span className="text-xs text-[#e0e0e8] truncate">{agentName}</span>
      </div>

      {/* Swimlane area */}
      <div
        className="relative bg-[#0a0a0f] group-hover:bg-[#0f0f18] transition-colors"
        style={{ width, height: swimlaneHeight }}
      >
        {/* Run bars */}
        {runs.map((run) => {
          const position = getPosition(run.startedAt);
          const barWidth = getBarWidth(run.startedAt, run.completedAt);
          const bgColor = statusColors[run.status] || 'bg-gray-500';
          const borderColor = statusBorderColors[run.status] || 'border-gray-400';
          const isSelected = selectedRunId === run.id;
          const isActive = run.status === 'running' || (run.status as string) === 'active';
          const TriggerIcon = triggerIcons[run.trigger] || Zap;
          const row = rowAssignments.get(run.id) || 0;
          const topPosition = ROW_GAP + row * (ROW_HEIGHT + ROW_GAP);

          return (
            <button
              key={run.id}
              onClick={() => onRunClick(run)}
              className={`absolute h-6 rounded-md border-2 ${borderColor} ${bgColor} bg-opacity-30 hover:bg-opacity-50 transition-all cursor-pointer flex items-center justify-center gap-1 overflow-hidden ${
                isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-[#0a0a0f] z-20' : 'z-10'
              } ${isActive ? 'animate-pulse' : ''}`}
              style={{ left: position, top: topPosition, width: barWidth, minWidth: 24 }}
              title={`${run.trigger} - ${run.status} - ${formatTimestamp(run.startedAt)}`}
            >
              <TriggerIcon className="w-3 h-3 text-white shrink-0" />
              {barWidth > 60 && (
                <span className="text-[10px] text-white truncate pr-1">
                  {run.durationMs ? formatMs(run.durationMs) : 'running...'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TeamTimeline({ teamId }: TeamTimelineProps) {
  const [zoomMs, setZoomMs] = useState(6 * 60 * 60 * 1000);
  const [offset, setOffset] = useState(0);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [timelineWidth, setTimelineWidth] = useState(800);
  const [referenceTime, setReferenceTime] = useState(() => Date.now());

  // Calculate widths based on whether detail panel is open
  const detailPanelWidth = 400;
  const containerWidth = selectedRun ? timelineWidth - detailPanelWidth : timelineWidth;

  const endTime = useMemo(() => {
    return new Date(referenceTime + offset * zoomMs);
  }, [referenceTime, offset, zoomMs]);

  const startTime = useMemo(() => {
    return new Date(endTime.getTime() - zoomMs);
  }, [endTime, zoomMs]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['team-timeline', teamId, startTime.toISOString(), endTime.toISOString()],
    queryFn: () => getTeamTimeline(teamId, startTime.toISOString(), endTime.toISOString(), true),
    refetchInterval: 10000,
  });

  // Group runs by agent
  const runsByAgent = useMemo(() => {
    if (!data?.runs) return new Map<string, Run[]>();

    const grouped = new Map<string, Run[]>();
    for (const run of data.runs) {
      const agentId = run.agentId;
      const existing = grouped.get(agentId) || [];
      existing.push(run);
      grouped.set(agentId, existing);
    }
    return grouped;
  }, [data?.runs]);

  const agents = useMemo(() => {
    if (!data?.agents) return [];
    return data.agents;
  }, [data?.agents]);

  const handlePanLeft = () => setOffset((o) => o - 0.5);
  const handlePanRight = () => setOffset((o) => Math.min(0, o + 0.5));

  const handleZoomIn = () => {
    setZoomMs((z) => Math.max(MIN_ZOOM_MS, z / ZOOM_FACTOR));
  };

  const handleZoomOut = () => {
    setZoomMs((z) => Math.min(MAX_ZOOM_MS, z * ZOOM_FACTOR));
  };

  const presets = [
    { label: '15m', ms: 15 * 60 * 1000 },
    { label: '1h', ms: 60 * 60 * 1000 },
    { label: '6h', ms: 6 * 60 * 60 * 1000 },
    { label: '24h', ms: 24 * 60 * 60 * 1000 },
    { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  ];

  const handleRunClick = (run: Run) => {
    setSelectedRun(selectedRun?.id === run.id ? null : run);
  };

  const swimlaneWidth = containerWidth - 128;

  return (
    <div className="h-full flex flex-col bg-[#0a0a0f]">
      {/* Header with controls */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#1e1e3a] shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-[#e0e0e8]">Timeline</span>

          <div className="flex items-center gap-1 bg-[#12121a] rounded-lg p-1">
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  setZoomMs(preset.ms);
                  setOffset(0);
                }}
                className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                  Math.abs(zoomMs - preset.ms) < 1000
                    ? 'bg-indigo-600 text-white'
                    : 'text-[#4a4a5e] hover:text-[#7a7a8e]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <span className="text-[10px] text-[#4a4a5e]">
            Viewing: {formatDuration(zoomMs)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePanLeft}
            className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all"
            title="Pan left (earlier)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handlePanRight}
            disabled={offset >= 0}
            className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all disabled:opacity-30"
            title="Pan right (later)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={handleZoomIn}
              disabled={zoomMs <= MIN_ZOOM_MS}
              className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all disabled:opacity-30"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              disabled={zoomMs >= MAX_ZOOM_MS}
              className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all disabled:opacity-30"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => {
              setReferenceTime(Date.now());
              refetch();
            }}
            disabled={isFetching}
            className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all disabled:opacity-50 ml-2"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Timeline content with side panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Timeline area */}
        <div
          className="flex-1 overflow-auto relative"
          ref={(el) => {
            if (el) {
              const width = el.clientWidth;
              if (width !== timelineWidth) {
                setTimelineWidth(width);
              }
            }
          }}
        >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-400" />
          </div>
        ) : agents.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-[#4a4a5e] text-sm">No activity in this time range</p>
              <p className="text-[10px] text-[#4a4a5e] mt-1">Try zooming out or panning to find runs</p>
            </div>
          </div>
        ) : (
          <div className="min-w-fit">
            {/* Time axis */}
            <div className="flex border-b border-[#1e1e3a] sticky top-0 bg-[#0a0a0f] z-20">
              <div className="w-32 shrink-0 px-3 py-1 bg-[#0f0f18] border-r border-[#1e1e3a]">
                <span className="text-[10px] text-[#4a4a5e]">Agent</span>
              </div>
              <div style={{ width: swimlaneWidth }}>
                <TimeAxis
                  start={startTime}
                  end={endTime}
                  zoomMs={zoomMs}
                  width={swimlaneWidth}
                />
              </div>
            </div>

            {/* Agent swimlanes */}
            {agents.map((agent) => (
              <AgentSwimlane
                key={agent.id}
                agentId={agent.id}
                agentName={agent.name}
                runs={runsByAgent.get(agent.id) || []}
                start={startTime}
                end={endTime}
                width={swimlaneWidth}
                selectedRunId={selectedRun?.id || null}
                onRunClick={handleRunClick}
              />
            ))}
          </div>
        )}
        </div>

        {/* Run detail panel - side panel */}
        {selectedRun && (
          <div
            className="shrink-0 border-l border-[#1e1e3a] overflow-hidden"
            style={{ width: detailPanelWidth }}
          >
            <RunDetailPanel
              run={selectedRun}
              agentId={selectedRun.agentId}
              onClose={() => setSelectedRun(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
