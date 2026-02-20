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
  Activity,
  Inbox,
} from 'lucide-react';
import type { Agent, Team, TeamEvent, TeamEventType, MailMessage } from '../../types/agent';
import { getTeamEvents } from '../../api/teams';
import { getMailbox } from '../../api/mailbox';
import { useOrchestratorDispatch } from './OrchestratorContext';

const statusColors: Record<string, string> = {
  running: 'bg-emerald-400',
  starting: 'bg-yellow-400',
  stopping: 'bg-yellow-400',
  stopped: 'bg-red-400',
  error: 'bg-red-400',
  created: 'bg-[#4a4a5e]',
};

const statusLabels: Record<string, string> = {
  running: 'Running',
  starting: 'Starting',
  stopping: 'Stopping',
  stopped: 'Stopped',
  error: 'Error',
  created: 'Created',
};

const eventConfig: Record<TeamEventType, {
  icon: typeof UserPlus;
  color: string;
  bgColor: string;
}> = {
  agent_joined: { icon: UserPlus, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  agent_left: { icon: UserMinus, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  agent_started: { icon: Play, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  agent_stopped: { icon: Square, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  agent_deleted: { icon: Trash2, color: 'text-red-400', bgColor: 'bg-red-500/10' },
  message_sent: { icon: MessageSquare, color: 'text-indigo-400', bgColor: 'bg-indigo-500/10' },
  mail_sent: { icon: Mail, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  mail_received: { icon: MailOpen, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  processing_started: { icon: Loader2, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  processing_completed: { icon: CheckCircle, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  processing_failed: { icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-500/10' },
};

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface DashboardViewProps {
  agents: Agent[];
  teams: Team[];
}

export function DashboardView({ agents, teams }: DashboardViewProps) {
  const dispatch = useOrchestratorDispatch();

  // Fetch recent mail from all teams (limit 5 each)
  const { data: allMail = [] } = useQuery<MailMessage[]>({
    queryKey: ['dashboard-unified-inbox', teams.map((t) => t.id).join(',')],
    queryFn: async () => {
      if (teams.length === 0) return [];
      const results = await Promise.all(
        teams.map((t) => getMailbox(t.id, { limit: 5 }).catch(() => []))
      );
      return results
        .flat()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 15);
    },
    refetchInterval: 10000,
    enabled: teams.length > 0,
  });

  // Fetch recent events from all teams (limit 10 each)
  const { data: allEvents = [] } = useQuery<TeamEvent[]>({
    queryKey: ['dashboard-activity-timeline', teams.map((t) => t.id).join(',')],
    queryFn: async () => {
      if (teams.length === 0) return [];
      const results = await Promise.all(
        teams.map((t) => getTeamEvents(t.id, 10).catch(() => []))
      );
      return results
        .flat()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 20);
    },
    refetchInterval: 10000,
    enabled: teams.length > 0,
  });

  const teamNameMap = new Map(teams.map((t) => [t.id, t.name]));

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Agent Status Grid */}
      <div>
        <h2 className="text-sm font-semibold text-[#e0e0e8] mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          Agent Status
        </h2>
        {agents.length === 0 ? (
          <p className="text-xs text-[#4a4a5e]">No agents created yet</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() =>
                  dispatch({
                    type: 'OPEN_TAB',
                    payload: { tabType: 'agent', entityId: agent.id, label: agent.name },
                  })
                }
                className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-3 text-left hover:border-[#2a2a4a] transition-all duration-200 group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-2 h-2 rounded-full ${statusColors[agent.status] || 'bg-[#4a4a5e]'} ${
                      agent.status === 'running' ? 'animate-pulse' : ''
                    }`}
                  />
                  <span className="text-xs font-medium text-[#e0e0e8] truncate">{agent.name}</span>
                </div>
                <span className="text-[10px] text-[#4a4a5e]">
                  {statusLabels[agent.status] || agent.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Unified Inbox */}
      {teams.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#e0e0e8] mb-3 flex items-center gap-2">
            <Inbox className="w-4 h-4 text-indigo-400" />
            Unified Inbox
          </h2>
          {allMail.length === 0 ? (
            <p className="text-xs text-[#4a4a5e]">No messages yet</p>
          ) : (
            <div className="space-y-1">
              {allMail.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() =>
                    dispatch({
                      type: 'OPEN_TAB',
                      payload: {
                        tabType: 'team',
                        entityId: msg.teamId,
                        label: teamNameMap.get(msg.teamId) || 'Team',
                      },
                    })
                  }
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#12121a] transition-all duration-150 text-left"
                >
                  {!msg.read && msg.direction === 'agent_to_human' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-indigo-400">{teamNameMap.get(msg.teamId) || 'Team'}</span>
                      <span className="text-[10px] text-[#4a4a5e]">{msg.agentName}</span>
                      <span className="text-[10px] text-[#4a4a5e] ml-auto shrink-0">
                        {formatRelativeTime(msg.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-[#e0e0e8] truncate">{msg.subject}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Activity Timeline */}
      {teams.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#e0e0e8] mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            Activity Timeline
          </h2>
          {allEvents.length === 0 ? (
            <p className="text-xs text-[#4a4a5e]">No events yet</p>
          ) : (
            <div className="space-y-1">
              {allEvents.map((event) => {
                const config = eventConfig[event.type];
                const Icon = config?.icon || MessageSquare;
                const color = config?.color || 'text-[#4a4a5e]';
                const bgColor = config?.bgColor || 'bg-[#1a1a2e]';
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 px-3 py-2 rounded-lg"
                  >
                    <div className={`w-6 h-6 rounded-lg ${bgColor} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon className={`w-3 h-3 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-indigo-400">
                          {teamNameMap.get(event.teamId) || 'Team'}
                        </span>
                        <span className="text-[10px] text-[#4a4a5e] ml-auto shrink-0">
                          {formatRelativeTime(event.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-[#e0e0e8]">
                        {event.agentName} - {event.type.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
