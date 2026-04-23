import { useState } from 'react';
import { MessageSquare, Folder, History as HistoryIcon } from 'lucide-react';
import type { Agent } from '../../types/agent';
import { ConversationTab } from '../ConversationTab';
import { WorkspaceUnifiedTab } from '../WorkspaceUnifiedTab';
import { HistoryTab } from '../HistoryTab';

type SubTab = 'chat' | 'workspace' | 'history';

const subTabs: { id: SubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'workspace', label: 'Workspace', icon: Folder },
  { id: 'history', label: 'History', icon: HistoryIcon },
];

interface AgentWorkspaceViewProps {
  agent: Agent;
}

export function AgentWorkspaceView({ agent }: AgentWorkspaceViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('chat');

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-[#1e1e3a] px-4 shrink-0">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all duration-200 border-b-2 ${
                isActive
                  ? 'text-indigo-400 border-indigo-400'
                  : 'text-[#4a4a5e] border-transparent hover:text-[#7a7a8e]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-hidden">
        {activeSubTab === 'chat' && <ConversationTab agent={agent} />}
        {activeSubTab === 'workspace' && <WorkspaceUnifiedTab agent={agent} />}
        {activeSubTab === 'history' && <HistoryTab agent={agent} />}
      </div>
    </div>
  );
}
