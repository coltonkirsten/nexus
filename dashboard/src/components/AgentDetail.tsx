import { useState } from 'react';
import {
  Activity,
  FileText,
  Folder,
  BookOpen,
  Terminal,
  Settings,
  History,
} from 'lucide-react';
import type { Agent } from '../types/agent';
import { ActivityTab } from './ActivityTab';
import { ConfigTab } from './ConfigTab';
import { HistoryTab } from './HistoryTab';
import { LedgerTab } from './LedgerTab';
import { SystemPromptTab } from './SystemPromptTab';
import { WorkspaceTab } from './WorkspaceTab';

interface AgentDetailProps {
  agent: Agent;
}

type TabId = 'activity' | 'system-prompt' | 'workspace' | 'ledger' | 'terminal' | 'config' | 'history';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: Tab[] = [
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'system-prompt', label: 'System Prompt', icon: FileText },
  { id: 'workspace', label: 'Workspace', icon: Folder },
  { id: 'ledger', label: 'Ledger', icon: BookOpen },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'config', label: 'Config', icon: Settings },
  { id: 'history', label: 'History', icon: History },
];

function PlaceholderTab({ tabName }: { tabName: string }) {
  return (
    <div className="flex items-center justify-center h-full text-gray-500">
      <div className="text-center">
        <p className="text-lg font-medium">{tabName}</p>
        <p className="mt-1 text-sm">Coming in Phase 2</p>
      </div>
    </div>
  );
}

export function AgentDetail({ agent }: AgentDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>('activity');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'activity':
        return <ActivityTab agent={agent} />;
      case 'system-prompt':
        return <SystemPromptTab agent={agent} />;
      case 'workspace':
        return <WorkspaceTab agent={agent} />;
      case 'ledger':
        return <LedgerTab agent={agent} />;
      case 'terminal':
        return <PlaceholderTab tabName="Terminal" />;
      case 'config':
        return <ConfigTab agent={agent} />;
      case 'history':
        return <HistoryTab agent={agent} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Agent header */}
      <div className="px-6 py-4 border-b border-gray-700">
        <h2 className="text-xl font-semibold text-white">{agent.name}</h2>
        <p className="text-sm text-gray-400 mt-1">ID: {agent.id}</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/30'
              }`}
            >
              <Icon className="w-4 h-4" />
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
