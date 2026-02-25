import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  ExternalLink,
  Mail,
  UserPlus,
  UserMinus,
  Play,
  Square,
  Trash2,
  MessageSquare,
  MailOpen,
  Loader2,
  CheckCircle,
  XCircle,
  File,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  HardDrive,
  RefreshCw,
  ArrowRight,
  Pause,
} from 'lucide-react';
import type { Team, TeamEvent, TeamEventType } from '../../types/agent';
import { getTeamMembers, getTeamEvents, getTeamSharedTree, type TeamMember } from '../../api/teams';
import type { FileEntry } from '../../api/agents';
import { getUnreadCount, getMailbox } from '../../api/mailbox';
import type { MailMessage } from '../../types/agent';
import { useOrchestratorDispatch } from './OrchestratorContext';

const statusColors: Record<string, string> = {
  running: 'bg-emerald-400',
  starting: 'bg-yellow-400',
  stopping: 'bg-yellow-400',
  stopped: 'bg-red-400',
  error: 'bg-red-400',
  created: 'bg-[#4a4a5e]',
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
  agent_rebuilt: { icon: RefreshCw, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  session_cleared: { icon: Trash2, color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
  intercom_sent: { icon: ArrowRight, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  agent_paused: { icon: Pause, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  agent_resumed: { icon: Play, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
};

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function FileTreeNode({ entry, depth = 0 }: { entry: FileEntry; depth?: number }) {
  const [expanded, setExpanded] = useState(false);
  const isDir = entry.type === 'directory';

  return (
    <div>
      <button
        onClick={() => isDir && setExpanded(!expanded)}
        className={`w-full flex items-center gap-1.5 py-0.5 text-left hover:bg-[#1a1a2e] rounded transition-colors ${
          isDir ? 'cursor-pointer' : 'cursor-default'
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {isDir ? (
          <>
            {expanded ? (
              <ChevronDown className="w-2.5 h-2.5 text-[#4a4a5e] shrink-0" />
            ) : (
              <ChevronRight className="w-2.5 h-2.5 text-[#4a4a5e] shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="w-3 h-3 text-amber-400 shrink-0" />
            ) : (
              <Folder className="w-3 h-3 text-amber-400 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-2.5 shrink-0" />
            <File className="w-3 h-3 text-[#4a4a5e] shrink-0" />
          </>
        )}
        <span className="text-[10px] text-[#e0e0e8] truncate">{entry.name}</span>
      </button>
      {isDir && expanded && entry.children && (
        <div>
          {entry.children.map((child) => (
            <FileTreeNode key={child.path} entry={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TeamInspector({ team }: { team: Team }) {
  const navigate = useNavigate();
  const dispatch = useOrchestratorDispatch();

  const { data: members = [] } = useQuery<TeamMember[]>({
    queryKey: ['team-members', team.id],
    queryFn: () => getTeamMembers(team.id),
    refetchInterval: 5000,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['mailbox-unread', team.id],
    queryFn: () => getUnreadCount(team.id),
    refetchInterval: 10000,
  });

  const { data: recentMail = [] } = useQuery<MailMessage[]>({
    queryKey: ['mailbox', team.id, 'inspector'],
    queryFn: () => getMailbox(team.id, { unreadOnly: true, limit: 1 }),
    refetchInterval: 10000,
  });

  const { data: events = [] } = useQuery<TeamEvent[]>({
    queryKey: ['team-events', team.id],
    queryFn: () => getTeamEvents(team.id, 5),
    refetchInterval: 10000,
  });

  const { data: sharedTree = [] } = useQuery<FileEntry[]>({
    queryKey: ['team-shared-tree', team.id],
    queryFn: () => getTeamSharedTree(team.id),
  });

  const recentEvents = [...events].reverse().slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Team Header */}
      <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-[#e0e0e8] truncate">{team.name}</h3>
        </div>
        {team.description && (
          <p className="text-[10px] text-[#7a7a8e] mb-2">{team.description}</p>
        )}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-indigo-400 bg-indigo-500/10 rounded-full px-2 py-0.5">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => navigate(`/team/${team.id}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#7a7a8e] hover:text-[#e0e0e8] border border-[#1e1e3a] hover:border-[#2a2a4a] rounded-lg transition-all duration-200"
        >
          <ExternalLink className="w-3 h-3" />
          Full View
        </button>
      </div>

      {/* Members List */}
      <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
        <h4 className="text-xs font-medium text-[#e0e0e8] mb-2 flex items-center gap-1.5">
          <Users className="w-3 h-3 text-indigo-400" />
          Members
        </h4>
        {members.length === 0 ? (
          <p className="text-[10px] text-[#4a4a5e]">No members</p>
        ) : (
          <div className="space-y-1">
            {members.map((member) => (
              <button
                key={member.id}
                onClick={() =>
                  dispatch({
                    type: 'OPEN_TAB',
                    payload: { tabType: 'agent', entityId: member.id, label: member.name },
                  })
                }
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#1a1a2e] transition-all duration-150"
              >
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${statusColors[member.status] || 'bg-[#4a4a5e]'} ${
                    member.status === 'running' ? 'animate-pulse' : ''
                  }`}
                />
                <span className="text-[10px] text-[#e0e0e8] truncate">{member.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Unread Mail */}
      <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
        <h4 className="text-xs font-medium text-[#e0e0e8] mb-2 flex items-center gap-1.5">
          <Mail className="w-3 h-3 text-indigo-400" />
          Mail
        </h4>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[#4a4a5e]">Unread</span>
          <span className={`text-[10px] ${unreadCount > 0 ? 'text-amber-400' : 'text-[#7a7a8e]'}`}>
            {unreadCount}
          </span>
        </div>
        {recentMail.length > 0 && (
          <p className="text-[10px] text-[#7a7a8e] truncate mt-1">
            Latest: {recentMail[0].subject}
          </p>
        )}
      </div>

      {/* Shared Drive */}
      <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
        <h4 className="text-xs font-medium text-[#e0e0e8] mb-2 flex items-center gap-1.5">
          <HardDrive className="w-3 h-3 text-indigo-400" />
          Shared Drive
        </h4>
        {sharedTree.length === 0 ? (
          <p className="text-[10px] text-[#4a4a5e]">No files</p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {sharedTree.map((entry) => (
              <FileTreeNode key={entry.path} entry={entry} />
            ))}
          </div>
        )}
        <button
          onClick={() => navigate(`/team/${team.id}/shared`)}
          className="flex items-center gap-1.5 mt-2 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <ExternalLink className="w-2.5 h-2.5" />
          View Shared Drive
        </button>
      </div>

      {/* Recent Events */}
      {recentEvents.length > 0 && (
        <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
          <h4 className="text-xs font-medium text-[#e0e0e8] mb-2">Recent Events</h4>
          <div className="space-y-1.5">
            {recentEvents.map((event) => {
              const config = eventConfig[event.type];
              const Icon = config?.icon || MessageSquare;
              const color = config?.color || 'text-[#4a4a5e]';
              const bgColor = config?.bgColor || 'bg-[#1a1a2e]';
              return (
                <div key={event.id} className="flex items-start gap-2">
                  <div className={`w-5 h-5 rounded ${bgColor} flex items-center justify-center shrink-0 mt-0.5`}>
                    <Icon className={`w-2.5 h-2.5 ${color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-[#e0e0e8]">
                      {event.agentName} - {event.type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[9px] text-[#4a4a5e]">{formatTime(event.timestamp)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
