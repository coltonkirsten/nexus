import { PanelRightClose, Search, Pin, PinOff } from 'lucide-react';
import type { Agent, Team } from '../../types/agent';
import { useOrchestrator, useOrchestratorDispatch } from './OrchestratorContext';
import { AgentInspector } from './AgentInspector';
import { TeamInspector } from './TeamInspector';

interface InspectorPanelProps {
  agents: Agent[];
  teams: Team[];
}

export function InspectorPanel({ agents, teams }: InspectorPanelProps) {
  const { inspectorCollapsed, inspectorPinned, selectedEntityId, selectedEntityType } = useOrchestrator();
  const dispatch = useOrchestratorDispatch();

  // When pinned, the inspector stays visible even if user toggled it collapsed.
  if (inspectorCollapsed && !inspectorPinned) return null;

  const selectedAgent =
    selectedEntityType === 'agent' && selectedEntityId
      ? agents.find((a) => a.id === selectedEntityId)
      : null;

  const selectedTeam =
    selectedEntityType === 'team' && selectedEntityId
      ? teams.find((t) => t.id === selectedEntityId)
      : null;

  return (
    <div className="w-[320px] h-full border-l border-[#1e1e3a] flex flex-col shrink-0 bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e1e3a] shrink-0">
        <span className="text-xs font-medium text-[#7a7a8e]">Inspector</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => dispatch({ type: 'TOGGLE_INSPECTOR_PIN' })}
            className={`p-1 rounded transition-colors ${
              inspectorPinned
                ? 'text-indigo-400 hover:text-indigo-300'
                : 'text-[#4a4a5e] hover:text-[#7a7a8e]'
            }`}
            title={inspectorPinned ? 'Unpin inspector' : 'Pin inspector (always visible)'}
          >
            {inspectorPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_INSPECTOR' })}
            className="p-1 text-[#4a4a5e] hover:text-[#7a7a8e] rounded transition-colors"
            title="Collapse inspector"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {selectedAgent ? (
          <AgentInspector agent={selectedAgent} />
        ) : selectedTeam ? (
          <TeamInspector team={selectedTeam} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center px-4">
              <Search className="w-8 h-8 mx-auto mb-2 text-[#1e1e3a]" />
              <p className="text-xs text-[#4a4a5e]">
                {inspectorPinned
                  ? 'Select an agent or team to inspect'
                  : 'Select an entity to inspect'}
              </p>
              {inspectorPinned && (
                <p className="text-[10px] text-[#4a4a5e] mt-2">Pinned</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
