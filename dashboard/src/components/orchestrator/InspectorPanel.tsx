import { PanelRightClose, Search } from 'lucide-react';
import type { Agent, Team } from '../../types/agent';
import { useOrchestrator, useOrchestratorDispatch } from './OrchestratorContext';
import { AgentInspector } from './AgentInspector';
import { TeamInspector } from './TeamInspector';

interface InspectorPanelProps {
  agents: Agent[];
  teams: Team[];
}

export function InspectorPanel({ agents, teams }: InspectorPanelProps) {
  const { inspectorCollapsed, selectedEntityId, selectedEntityType } = useOrchestrator();
  const dispatch = useOrchestratorDispatch();

  if (inspectorCollapsed) return null;

  const selectedAgent =
    selectedEntityType === 'agent' && selectedEntityId
      ? agents.find((a) => a.id === selectedEntityId)
      : null;

  const selectedTeam =
    selectedEntityType === 'team' && selectedEntityId
      ? teams.find((t) => t.id === selectedEntityId)
      : null;

  return (
    <div className="w-[320px] border-l border-[#1e1e3a] flex flex-col shrink-0 bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e1e3a] shrink-0">
        <span className="text-xs font-medium text-[#7a7a8e]">Inspector</span>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_INSPECTOR' })}
          className="p-1 text-[#4a4a5e] hover:text-[#7a7a8e] rounded transition-colors"
          title="Collapse inspector"
        >
          <PanelRightClose className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {selectedAgent ? (
          <AgentInspector agent={selectedAgent} />
        ) : selectedTeam ? (
          <TeamInspector team={selectedTeam} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Search className="w-8 h-8 mx-auto mb-2 text-[#1e1e3a]" />
              <p className="text-xs text-[#4a4a5e]">Select an entity to inspect</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
