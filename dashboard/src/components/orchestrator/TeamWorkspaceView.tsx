import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, Users, Kanban, HardDrive, Activity, GitBranch } from 'lucide-react';
import type { Team } from '../../types/agent';
import { getUnreadCount } from '../../api/mailbox';
import { TeamMailboxTab } from '../TeamMailboxTab';
import { TeamAgentsTab } from '../TeamAgentsTab';
import { TeamKanbanTab } from '../TeamKanbanTab';
import { TeamSharedDriveTab } from '../TeamSharedDriveTab';
import { TeamLogsTab } from '../TeamLogsTab';
import { TeamTimeline } from '../TeamTimeline';

type SubTab = 'mailbox' | 'members' | 'kanban' | 'shared' | 'logs' | 'timeline';

const subTabs: { id: SubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'mailbox', label: 'Mailbox', icon: Mail },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'kanban', label: 'Kanban', icon: Kanban },
  { id: 'shared', label: 'Shared Drive', icon: HardDrive },
  { id: 'logs', label: 'Logs', icon: Activity },
  { id: 'timeline', label: 'Timeline', icon: GitBranch },
];

interface TeamWorkspaceViewProps {
  team: Team;
}

export function TeamWorkspaceView({ team }: TeamWorkspaceViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('mailbox');

  const { data: mailboxUnread = 0 } = useQuery({
    queryKey: ['mailbox-unread', team.id],
    queryFn: () => getUnreadCount(team.id),
    refetchInterval: 2000,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-[#1e1e3a] px-4 overflow-x-auto scrollbar-none shrink-0">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          const badge = tab.id === 'mailbox' ? mailboxUnread : 0;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all duration-200 border-b-2 shrink-0 ${
                isActive
                  ? 'text-indigo-400 border-indigo-400'
                  : 'text-[#4a4a5e] border-transparent hover:text-[#7a7a8e]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {badge > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] bg-indigo-500 text-white rounded-full leading-none">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-hidden">
        {activeSubTab === 'mailbox' && <TeamMailboxTab teamId={team.id} />}
        {activeSubTab === 'members' && <TeamAgentsTab teamId={team.id} />}
        {activeSubTab === 'kanban' && <TeamKanbanTab teamId={team.id} />}
        {activeSubTab === 'shared' && <TeamSharedDriveTab teamId={team.id} />}
        {activeSubTab === 'logs' && <TeamLogsTab teamId={team.id} />}
        {activeSubTab === 'timeline' && <TeamTimeline teamId={team.id} />}
      </div>
    </div>
  );
}
