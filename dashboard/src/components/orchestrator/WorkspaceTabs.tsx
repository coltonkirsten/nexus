import { useEffect } from 'react';
import { X, PanelRight, ChevronRight } from 'lucide-react';
import type { Agent, Team } from '../../types/agent';
import { useOrchestrator, useOrchestratorDispatch } from './OrchestratorContext';
import { AgentWorkspaceView } from './AgentWorkspaceView';
import { TeamWorkspaceView } from './TeamWorkspaceView';
import { DashboardView } from './DashboardView';

const statusColors: Record<string, string> = {
  running: 'bg-emerald-400',
  starting: 'bg-yellow-400',
  stopping: 'bg-yellow-400',
  stopped: 'bg-red-400',
  error: 'bg-red-400',
  created: 'bg-[#4a4a5e]',
};

interface WorkspaceTabsProps {
  agents: Agent[];
  teams: Team[];
}

export function WorkspaceTabs({ agents, teams }: WorkspaceTabsProps) {
  const { tabs, activeTabId, inspectorCollapsed } = useOrchestrator();
  const dispatch = useOrchestratorDispatch();

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Keep tab labels in sync with entity names
  useEffect(() => {
    for (const tab of tabs) {
      if (tab.type === 'agent') {
        const agent = agents.find((a) => a.id === tab.entityId);
        if (agent && agent.name !== tab.label) {
          dispatch({ type: 'UPDATE_TAB_LABEL', payload: { tabId: tab.id, label: agent.name } });
        }
      } else {
        const team = teams.find((t) => t.id === tab.entityId);
        if (team && team.name !== tab.label) {
          dispatch({ type: 'UPDATE_TAB_LABEL', payload: { tabId: tab.id, label: team.name } });
        }
      }
    }
  }, [agents, teams, tabs, dispatch]);

  const getAgentStatus = (entityId: string): string => {
    const agent = agents.find((a) => a.id === entityId);
    return agent?.status || 'created';
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Tab bar */}
      {tabs.length > 0 && (
        <div className="flex items-center border-b border-[#1e1e3a] bg-[#0a0a0f] shrink-0">
          <div className="flex-1 flex items-center overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              const status = tab.type === 'agent' ? getAgentStatus(tab.entityId) : null;
              return (
                <button
                  key={tab.id}
                  onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: { tabId: tab.id } })}
                  className={`group flex items-center gap-2 px-3 md:px-4 py-2.5 md:py-2 text-xs border-b-2 transition-all duration-150 shrink-0 min-h-[44px] md:min-h-0 ${
                    isActive
                      ? 'text-[#e0e0e8] border-indigo-400 bg-[#12121a]'
                      : 'text-[#4a4a5e] border-transparent hover:text-[#7a7a8e] hover:bg-[#12121a]/50'
                  }`}
                >
                  {status && (
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${statusColors[status] || 'bg-[#4a4a5e]'} ${
                        status === 'running' ? 'animate-pulse' : ''
                      }`}
                    />
                  )}
                  <span className="truncate max-w-[120px]">{tab.label}</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'CLOSE_TAB', payload: { tabId: tab.id } });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#1a1a2e] text-[#4a4a5e] hover:text-[#e0e0e8] transition-all duration-150"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
              );
            })}
          </div>
          {/* Inspector toggle - hidden on mobile/tablet since inspector is always hidden there */}
          <button
            onClick={() => dispatch({ type: 'TOGGLE_INSPECTOR' })}
            className={`hidden lg:block px-3 py-2 border-l border-[#1e1e3a] transition-all duration-150 shrink-0 ${
              inspectorCollapsed
                ? 'text-[#4a4a5e] hover:text-[#7a7a8e]'
                : 'text-indigo-400'
            }`}
            title={inspectorCollapsed ? 'Show inspector' : 'Hide inspector'}
          >
            <PanelRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Breadcrumbs */}
      {activeTab && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[#1e1e3a] bg-[#0a0a0f]/60 shrink-0 text-[11px] text-[#4a4a5e]">
          <span className="text-[#7a7a8e]">Orchestrator</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-indigo-400 font-medium">{activeTab.label}</span>
          <span className="ml-2 text-[10px] text-[#4a4a5e] uppercase tracking-wider">
            {activeTab.type}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!activeTab ? (
          <DashboardView agents={agents} teams={teams} />
        ) : activeTab.type === 'agent' ? (
          <div key={activeTab.entityId} className="h-full">
            {(() => {
              const agent = agents.find((a) => a.id === activeTab.entityId);
              if (!agent) {
                return (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-[#4a4a5e] text-sm">Agent not found</p>
                  </div>
                );
              }
              return <AgentWorkspaceView agent={agent} />;
            })()}
          </div>
        ) : (
          <div key={activeTab.entityId} className="h-full">
            {(() => {
              const team = teams.find((t) => t.id === activeTab.entityId);
              if (!team) {
                return (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-[#4a4a5e] text-sm">Team not found</p>
                  </div>
                );
              }
              return <TeamWorkspaceView team={team} />;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
