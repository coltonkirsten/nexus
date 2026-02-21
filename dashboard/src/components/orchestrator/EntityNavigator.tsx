import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  ChevronRight,
  ChevronDown,
  Users,
  Play,
  Square,
  Loader2,
  Mail,
  Cpu,
  Trash2,
} from 'lucide-react';
import type { Agent, Team } from '../../types/agent';
import { startAgent, stopAgent, deleteAgent } from '../../api/agents';
import { useOrchestratorDispatch } from './OrchestratorContext';

// Status colors:
// - Processing (running + isProcessing): pulsing green
// - Running idle: solid green
// - Stopped/created: grey
// - Error: red
// - Starting/stopping: yellow
function getStatusStyle(agent: Agent): { color: string; pulse: boolean } {
  if (agent.status === 'error') {
    return { color: 'bg-red-500', pulse: false };
  }
  if (agent.status === 'starting' || agent.status === 'stopping') {
    return { color: 'bg-yellow-400', pulse: true };
  }
  if (agent.status === 'running') {
    if (agent.isProcessing) {
      return { color: 'bg-emerald-400', pulse: true };
    }
    return { color: 'bg-emerald-400', pulse: false };
  }
  // stopped, created, or unknown
  return { color: 'bg-[#4a4a5e]', pulse: false };
}

interface EntityNavigatorProps {
  agents: Agent[];
  teams: Team[];
  unreadCounts: Record<string, number>;
  isLoading: boolean;
}

function AgentNode({ agent }: { agent: Agent }) {
  const dispatch = useOrchestratorDispatch();
  const queryClient = useQueryClient();
  const isRunning = agent.status === 'running';
  const isTransitioning = agent.status === 'starting' || agent.status === 'stopping';

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteVolumesToo, setDeleteVolumesToo] = useState(false);

  const startMutation = useMutation({
    mutationFn: () => startAgent(agent.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => stopAgent(agent.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (deleteVols: boolean) => deleteAgent(agent.id, deleteVols),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['volumes'] });
      dispatch({ type: 'CLOSE_TAB_BY_ENTITY', payload: { entityId: agent.id } });
    },
  });

  const handleClick = () => {
    dispatch({ type: 'OPEN_TAB', payload: { tabType: 'agent', entityId: agent.id, label: agent.name } });
  };

  const handleStartStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunning) {
      stopMutation.mutate();
    } else {
      startMutation.mutate();
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="group w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#1a1a2e] rounded-lg transition-all duration-150"
      >
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${getStatusStyle(agent).color} ${
            getStatusStyle(agent).pulse ? 'animate-pulse' : ''
          }`}
        />
        <span className="text-xs text-[#e0e0e8] truncate flex-1">{agent.name}</span>
        <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 ${
          agent.cellType === 'cli'
            ? 'bg-purple-500/10 text-purple-400'
            : 'bg-indigo-500/10 text-indigo-400'
        }`}>
          {agent.cellType === 'cli' ? 'CLI' : 'SDK'}
        </span>
        {/* Hover actions */}
        <button
          onClick={handleStartStop}
          disabled={isTransitioning || startMutation.isPending || stopMutation.isPending}
          className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all duration-150 shrink-0 disabled:opacity-50 ${
            isRunning
              ? 'text-red-400 hover:bg-red-500/10'
              : 'text-emerald-400 hover:bg-emerald-500/10'
          }`}
          title={isRunning ? 'Stop' : 'Start'}
        >
          {(startMutation.isPending || stopMutation.isPending) ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : isRunning ? (
            <Square className="w-3 h-3" />
          ) : (
            <Play className="w-3 h-3" />
          )}
        </button>
        <button
          onClick={handleDeleteClick}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all duration-150 shrink-0 text-[#4a4a5e] hover:text-red-400 hover:bg-red-500/10"
          title="Delete"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </button>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative w-full max-w-sm bg-[#12121a] rounded-2xl shadow-2xl border border-[#1e1e3a] p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-sm font-semibold text-[#e0e0e8] mb-2">Delete Agent</h3>
              <p className="text-xs text-[#7a7a8e] mb-4 leading-relaxed">
                The agent will be removed but its volumes will be preserved and can be attached to other agents.
              </p>
              <label className="flex items-center gap-2 mb-6 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={deleteVolumesToo}
                  onChange={(e) => setDeleteVolumesToo(e.target.checked)}
                  className="rounded border-[#1e1e3a] bg-[#0f0f18] text-red-500 focus:ring-red-500/50"
                />
                <span className="text-xs text-[#7a7a8e]">Also delete volumes</span>
              </label>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteVolumesToo(false); }}
                  className="flex-1 px-4 py-2 text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl text-sm transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    deleteMutation.mutate(deleteVolumesToo);
                    setDeleteVolumesToo(false);
                  }}
                  className="flex-1 px-4 py-2 text-white text-sm rounded-xl transition-all duration-200 bg-red-600 hover:bg-red-500"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TeamNode({
  team,
  agents,
  unreadCount,
}: {
  team: Team;
  agents: Agent[];
  unreadCount: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const dispatch = useOrchestratorDispatch();

  const handleTeamClick = () => {
    dispatch({ type: 'OPEN_TAB', payload: { tabType: 'team', entityId: team.id, label: team.name } });
  };

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 text-[#4a4a5e] hover:text-[#7a7a8e] rounded transition-colors"
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>
        <button
          onClick={handleTeamClick}
          className="flex items-center gap-2 flex-1 min-w-0 px-1 py-1 hover:bg-[#1a1a2e] rounded-lg transition-all duration-150"
        >
          <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="text-xs font-medium text-[#e0e0e8] truncate">{team.name}</span>
          <span className="text-[9px] text-[#4a4a5e] shrink-0">{agents.length}</span>
          {unreadCount > 0 && (
            <span className="flex items-center gap-0.5 text-[9px] text-amber-400 bg-amber-500/10 rounded-full px-1.5 py-0.5 shrink-0">
              <Mail className="w-2.5 h-2.5" />
              {unreadCount}
            </span>
          )}
        </button>
      </div>
      {expanded && (
        <div className="ml-4 mt-0.5 space-y-0.5">
          {agents.map((agent) => (
            <AgentNode key={agent.id} agent={agent} />
          ))}
          {agents.length === 0 && (
            <p className="text-[10px] text-[#4a4a5e] px-3 py-1">No members</p>
          )}
        </div>
      )}
    </div>
  );
}

export function EntityNavigator({ agents, teams, unreadCounts, isLoading }: EntityNavigatorProps) {
  const [filter, setFilter] = useState('');

  const teamAgentsMap = new Map<string, Agent[]>();
  const standaloneAgents: Agent[] = [];

  for (const agent of agents) {
    if (agent.teamId) {
      const list = teamAgentsMap.get(agent.teamId) || [];
      list.push(agent);
      teamAgentsMap.set(agent.teamId, list);
    } else {
      standaloneAgents.push(agent);
    }
  }

  const lowerFilter = filter.toLowerCase();
  const filteredTeams = teams.filter((t) => {
    if (!lowerFilter) return true;
    if (t.name.toLowerCase().includes(lowerFilter)) return true;
    const members = teamAgentsMap.get(t.id) || [];
    return members.some((a) => a.name.toLowerCase().includes(lowerFilter));
  });
  const filteredStandalone = standaloneAgents.filter(
    (a) => !lowerFilter || a.name.toLowerCase().includes(lowerFilter)
  );

  return (
    <div className="w-[250px] border-r border-[#1e1e3a] flex flex-col shrink-0 bg-[#0a0a0f]">
      {/* Filter */}
      <div className="p-3 border-b border-[#1e1e3a]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4a4a5e]" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter..."
            className="w-full pl-8 pr-3 py-1.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-lg text-xs text-[#e0e0e8] placeholder-[#4a4a5e] focus:outline-none focus:border-indigo-500 transition-all duration-200"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <>
            {/* Teams section */}
            {filteredTeams.length > 0 && (
              <div>
                <p className="text-[9px] text-[#4a4a5e] uppercase tracking-wider px-3 mb-1.5">Teams</p>
                <div className="space-y-1">
                  {filteredTeams.map((team) => (
                    <TeamNode
                      key={team.id}
                      team={team}
                      agents={teamAgentsMap.get(team.id) || []}
                      unreadCount={unreadCounts[team.id] || 0}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Standalone agents section */}
            {filteredStandalone.length > 0 && (
              <div>
                <p className="text-[9px] text-[#4a4a5e] uppercase tracking-wider px-3 mb-1.5">Standalone Agents</p>
                <div className="space-y-0.5">
                  {filteredStandalone.map((agent) => (
                    <AgentNode key={agent.id} agent={agent} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {filteredTeams.length === 0 && filteredStandalone.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Cpu className="w-8 h-8 mx-auto mb-2 text-[#1e1e3a]" />
                  <p className="text-xs text-[#4a4a5e]">
                    {filter ? 'No matches' : 'No agents or teams'}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
