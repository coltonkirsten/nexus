import { useState } from 'react';
import { Folder, Terminal, BookOpen } from 'lucide-react';
import type { Agent } from '../types/agent';
import { WorkspaceTab } from './WorkspaceTab';
import { LedgerTab } from './LedgerTab';
import { TerminalView } from './TerminalView';

interface WorkspaceUnifiedTabProps {
  agent: Agent;
}

type SubTab = 'files' | 'terminal' | 'ledger';

const subTabs: { id: SubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'files', label: 'Files', icon: Folder },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'ledger', label: 'Ledger', icon: BookOpen },
];

export function WorkspaceUnifiedTab({ agent }: WorkspaceUnifiedTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('files');

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Segmented control */}
      <div className="flex items-center gap-1 px-6 py-3 border-b border-[#1e1e3a]">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                isActive
                  ? 'text-indigo-400 bg-indigo-500/10'
                  : 'text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeSubTab === 'files' && <WorkspaceTab agent={agent} />}
        {activeSubTab === 'terminal' && <TerminalView agent={agent} />}
        {activeSubTab === 'ledger' && <LedgerTab agent={agent} />}
      </div>
    </div>
  );
}
