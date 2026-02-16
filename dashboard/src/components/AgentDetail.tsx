import { useState } from 'react';
import {
  MessageSquare,
  Folder,
  Settings,
  History,
} from 'lucide-react';
import type { Agent } from '../types/agent';
import { ConversationTab } from './ConversationTab';
import { WorkspaceUnifiedTab } from './WorkspaceUnifiedTab';
import { SettingsTab } from './SettingsTab';
import { HistoryTab } from './HistoryTab';

interface AgentDetailProps {
  agent: Agent;
}

type TabId = 'conversation' | 'workspace' | 'settings' | 'history';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: Tab[] = [
  { id: 'conversation', label: 'Conversation', icon: MessageSquare },
  { id: 'workspace', label: 'Workspace', icon: Folder },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'history', label: 'History', icon: History },
];

export function AgentDetail({ agent }: AgentDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>('conversation');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'conversation':
        return <ConversationTab agent={agent} />;
      case 'workspace':
        return <WorkspaceUnifiedTab agent={agent} />;
      case 'settings':
        return <SettingsTab agent={agent} />;
      case 'history':
        return <HistoryTab agent={agent} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-[#1e1e3a] px-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium transition-all duration-200 border-b-2 ${
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

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {renderTabContent()}
      </div>
    </div>
  );
}
