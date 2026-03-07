import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Users, HardDrive, Activity, Mail, GitBranch, Kanban } from 'lucide-react';
import type { Team } from '../types/agent';
import { getTeam, getTeamMembers } from '../api/teams';
import { getUnreadCount } from '../api/mailbox';
import { TeamAgentsTab } from './TeamAgentsTab';
import { TeamSharedDriveTab } from './TeamSharedDriveTab';
import { TeamLogsTab } from './TeamLogsTab';
import { TeamMailboxTab } from './TeamMailboxTab';
import { TeamTimeline } from './TeamTimeline';
import { TeamKanbanTab } from './TeamKanbanTab';

export function TeamDetailPage() {
  const { teamId, tab } = useParams<{ teamId: string; tab?: string }>();
  const navigate = useNavigate();
  const activeTab = tab || 'agents';

  const { data: team, isLoading } = useQuery<Team>({
    queryKey: ['team', teamId],
    queryFn: () => getTeam(teamId!),
    refetchInterval: 5000,
    enabled: !!teamId,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['team-members', teamId],
    queryFn: () => getTeamMembers(teamId!),
    refetchInterval: 5000,
    enabled: !!teamId,
  });

  const { data: mailboxUnread = 0 } = useQuery({
    queryKey: ['mailbox-unread', teamId],
    queryFn: () => getUnreadCount(teamId!),
    refetchInterval: 5000,
    enabled: !!teamId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400 mx-auto mb-4" />
          <p className="text-[#4a4a5e] text-sm">Loading team...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#7a7a8e] text-sm mb-4">Team not found</p>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 text-sm text-indigo-400 hover:text-indigo-300 border border-[#1e1e3a] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Orchestrator
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'agents', label: 'Agents', icon: Users, badge: 0 },
    { key: 'kanban', label: 'Kanban', icon: Kanban, badge: 0 },
    { key: 'mailbox', label: 'Mailbox', icon: Mail, badge: mailboxUnread },
    { key: 'shared', label: 'Shared Drive', icon: HardDrive, badge: 0 },
    { key: 'logs', label: 'Logs', icon: Activity, badge: 0 },
    { key: 'timeline', label: 'Timeline', icon: GitBranch, badge: 0 },
  ];

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f]">
      {/* Header */}
      <header className="border-b border-[#1e1e3a] shrink-0">
        <div className="flex items-center gap-4 px-6 py-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200"
            title="Back to orchestrator"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3 min-w-0">
            <Users className="w-5 h-5 text-indigo-400 shrink-0" />
            <h1 className="text-base font-semibold text-[#e0e0e8] truncate">{team.name}</h1>
            <span className="text-xs text-[#4a4a5e]">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        {/* Tabs */}
        <div className="px-6">
          <nav className="flex gap-6">
            {tabs.map(({ key, label, icon: Icon, badge }) => (
              <button
                key={key}
                onClick={() => navigate(`/team/${teamId}/${key}`)}
                className={`flex items-center gap-2 pb-3 text-sm transition-all duration-200 border-b-2 ${
                  activeTab === key
                    ? 'text-indigo-400 border-indigo-400'
                    : 'text-[#4a4a5e] border-transparent hover:text-[#7a7a8e]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {badge > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-indigo-500 text-white rounded-full leading-none">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'agents' && <TeamAgentsTab teamId={teamId!} />}
        {activeTab === 'kanban' && <TeamKanbanTab teamId={teamId!} />}
        {activeTab === 'mailbox' && <TeamMailboxTab teamId={teamId!} />}
        {activeTab === 'shared' && <TeamSharedDriveTab teamId={teamId!} />}
        {activeTab === 'logs' && <TeamLogsTab teamId={teamId!} />}
        {activeTab === 'timeline' && <TeamTimeline teamId={teamId!} />}
      </div>
    </div>
  );
}
