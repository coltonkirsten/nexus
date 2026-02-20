import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  UserPlus,
  UserMinus,
  Play,
  Square,
  Trash2,
  MessageSquare,
  Mail,
  MailOpen,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import type { TeamEvent, TeamEventType } from '../types/agent';
import { getTeamEvents } from '../api/teams';

interface TeamLogsTabProps {
  teamId: string;
}

const eventConfig: Record<TeamEventType, {
  icon: typeof UserPlus;
  color: string;
  bgColor: string;
  label: (event: TeamEvent) => string;
}> = {
  agent_joined: {
    icon: UserPlus,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    label: (e) => `${e.agentName} joined the team`,
  },
  agent_left: {
    icon: UserMinus,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    label: (e) => `${e.agentName} left the team`,
  },
  agent_started: {
    icon: Play,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    label: (e) => `${e.agentName} started`,
  },
  agent_stopped: {
    icon: Square,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    label: (e) => `${e.agentName} stopped`,
  },
  agent_deleted: {
    icon: Trash2,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    label: (e) => `${e.agentName} was deleted`,
  },
  message_sent: {
    icon: MessageSquare,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    label: (e) => {
      const target = (e.data?.targetAgentName as string) || 'unknown';
      const preview = (e.data?.messagePreview as string) || '';
      return `${e.agentName} → ${target}: ${preview.slice(0, 80)}${preview.length > 80 ? '...' : ''}`;
    },
  },
  mail_sent: {
    icon: Mail,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    label: (e) => {
      const subject = (e.data?.subject as string) || '';
      const direction = e.data?.direction as string;
      if (direction === 'human_to_agent') {
        return `Human → ${e.agentName}: ${subject}`;
      }
      return `Mail sent to ${e.agentName}: ${subject}`;
    },
  },
  mail_received: {
    icon: MailOpen,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    label: (e) => {
      const subject = (e.data?.subject as string) || '';
      return `${e.agentName} sent mail to humans: ${subject}`;
    },
  },
  processing_started: {
    icon: Loader2,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    label: (e) => `${e.agentName} started processing`,
  },
  processing_completed: {
    icon: CheckCircle,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    label: (e) => `${e.agentName} completed processing`,
  },
  processing_failed: {
    icon: XCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    label: (e) => `${e.agentName} failed`,
  },
};

function EventEntry({ event }: { event: TeamEvent }) {
  const [expanded, setExpanded] = useState(false);
  const config = eventConfig[event.type];
  const Icon = config?.icon || MessageSquare;
  const color = config?.color || 'text-[#4a4a5e]';
  const bgColor = config?.bgColor || 'bg-[#1a1a2e]';
  const label = config?.label(event) || event.type;

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const hasDetail = event.type === 'message_sent' || event.type === 'processing_failed' || event.type === 'mail_sent' || event.type === 'mail_received';

  return (
    <div className="group">
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-all duration-200 rounded-xl ${
          hasDetail ? 'hover:bg-[#1a1a2e] cursor-pointer' : 'cursor-default'
        }`}
      >
        {/* Icon */}
        <div className={`w-7 h-7 rounded-lg ${bgColor} flex items-center justify-center shrink-0 mt-0.5`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#e0e0e8] leading-relaxed">{label}</p>
          <p className="text-[10px] text-[#4a4a5e] mt-0.5">{formatTimestamp(event.timestamp)}</p>
        </div>

        {/* Expand indicator */}
        {hasDetail && (
          <div className="text-[#4a4a5e] shrink-0 mt-1">
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </div>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div className="ml-10 mr-4 mb-2 px-4 py-3 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl">
          {event.type === 'message_sent' && (
            <div>
              <p className="text-[10px] text-[#4a4a5e] mb-1">Full message:</p>
              <p className="text-sm text-[#e0e0e8] whitespace-pre-wrap font-mono">
                {(event.data?.messagePreview as string) || 'No content'}
              </p>
            </div>
          )}
          {(event.type === 'mail_sent' || event.type === 'mail_received') && (
            <div>
              <p className="text-[10px] text-[#4a4a5e] mb-1">Subject:</p>
              <p className="text-sm text-[#e0e0e8]">
                {(event.data?.subject as string) || 'No subject'}
              </p>
            </div>
          )}
          {event.type === 'processing_failed' && event.data?.error && (
            <div>
              <p className="text-[10px] text-[#4a4a5e] mb-1">Error details:</p>
              <pre className="text-xs text-red-400 whitespace-pre-wrap font-mono">
                {typeof event.data.error === 'string'
                  ? event.data.error
                  : JSON.stringify(event.data.error, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TeamLogsTab({ teamId }: TeamLogsTabProps) {
  const { data: events = [], isLoading, refetch, isFetching } = useQuery<TeamEvent[]>({
    queryKey: ['team-events', teamId],
    queryFn: () => getTeamEvents(teamId),
    refetchInterval: 5000,
  });

  // Show newest first
  const sortedEvents = [...events].reverse();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#1e1e3a] shrink-0">
        <span className="text-sm font-medium text-[#e0e0e8]">Team Activity</span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-auto px-2 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-400" />
          </div>
        ) : sortedEvents.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <p className="text-[#4a4a5e] text-sm">No events yet</p>
              <p className="text-[10px] text-[#4a4a5e] mt-1">Events will appear as team members take actions</p>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {sortedEvents.map((event) => (
              <EventEntry key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
