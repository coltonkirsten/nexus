import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, UserMinus, Loader2, Pause, Play } from 'lucide-react';
import type { Agent } from '../types/agent';
import { listAgents, pauseAgent, resumeAgent } from '../api/agents';
import { getTeamMembers, addAgentToTeam, removeAgentFromTeam, type TeamMember } from '../api/teams';
import { useOrchestratorDispatch } from './orchestrator/OrchestratorContext';

interface TeamAgentsTabProps {
  teamId: string;
}

export function TeamAgentsTab({ teamId }: TeamAgentsTabProps) {
  const dispatch = useOrchestratorDispatch();
  const queryClient = useQueryClient();
  const [showAddDropdown, setShowAddDropdown] = useState(false);

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['team-members', teamId],
    queryFn: () => getTeamMembers(teamId),
    refetchInterval: 2000,
  });

  const { data: allAgents = [] } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: listAgents,
  });

  // Agents available to add: no team, stopped
  const availableAgents = allAgents.filter(
    (a) => !a.teamId && (a.status === 'stopped' || a.status === 'created')
  );

  const addMutation = useMutation({
    mutationFn: (agentId: string) => addAgentToTeam(teamId, agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setShowAddDropdown(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (agentId: string) => removeAgentFromTeam(teamId, agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const statusColors: Record<string, string> = {
    running: 'bg-emerald-400',
    starting: 'bg-yellow-400',
    stopping: 'bg-yellow-400',
    stopped: 'bg-red-400',
    paused: 'bg-amber-400',
    error: 'bg-red-400',
    created: 'bg-[#4a4a5e]',
  };

  const pauseMutation = useMutation({
    mutationFn: (agentId: string) => pauseAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (agentId: string) => resumeAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return 'No activity';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="h-full overflow-auto p-6">
      {/* Add Agent button */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-semibold text-[#e0e0e8]">Team Members</h2>
        <div className="relative">
          <button
            onClick={() => setShowAddDropdown(!showAddDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all duration-200"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Agent
          </button>

          {showAddDropdown && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-[#12121a] border border-[#1e1e3a] rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e3a]">
                <span className="text-xs text-[#7a7a8e]">Available agents (stopped only)</span>
                <button
                  onClick={() => setShowAddDropdown(false)}
                  className="p-0.5 text-[#4a4a5e] hover:text-[#7a7a8e] rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="max-h-48 overflow-auto">
                {availableAgents.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-[#4a4a5e] text-center">
                    No available agents. Create a new agent or stop/remove an existing one from its team.
                  </p>
                ) : (
                  availableAgents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => addMutation.mutate(agent.id)}
                      disabled={addMutation.isPending}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1a1a2e] transition-all duration-200 disabled:opacity-50"
                    >
                      <div className={`w-2 h-2 rounded-full ${statusColors[agent.status] || 'bg-[#4a4a5e]'}`} />
                      <span className="text-sm text-[#e0e0e8] truncate">{agent.name}</span>
                      {addMutation.isPending && addMutation.variables === agent.id && (
                        <Loader2 className="w-3 h-3 animate-spin text-indigo-400 ml-auto" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {addMutation.isError && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-xs text-red-400">
            {(addMutation.error as Error)?.message || 'Failed to add agent to team'}
          </p>
        </div>
      )}

      {removeMutation.isError && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-xs text-red-400">
            {(removeMutation.error as Error)?.message || 'Failed to remove agent from team'}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-400" />
        </div>
      ) : members.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <p className="text-[#4a4a5e] text-sm mb-2">No members yet</p>
            <p className="text-[#4a4a5e] text-xs">Add stopped agents to this team</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => {
            const isRunning = member.status === 'running';
            const isPaused = member.status === 'paused';
            const canRemove = !isRunning && !isPaused;
            return (
              <div
                key={member.id}
                className={`flex items-center gap-3 px-4 py-3 bg-[#12121a] border rounded-xl hover:border-[#2a2a4a] transition-all duration-200 cursor-pointer ${
                  isPaused ? 'border-amber-500/30' : 'border-[#1e1e3a]'
                }`}
                onClick={() =>
                  dispatch({
                    type: 'OPEN_TAB',
                    payload: { tabType: 'agent', entityId: member.id, label: member.name },
                  })
                }
              >
                <div className={`w-2.5 h-2.5 rounded-full ${statusColors[member.status] || 'bg-[#4a4a5e]'} ${isRunning ? 'animate-pulse' : ''}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#e0e0e8] truncate">{member.name}</p>
                  <p className="text-[10px] text-[#4a4a5e]">{formatTime(member.lastActivity)}</p>
                </div>
                <span className={`text-[10px] rounded-full px-2.5 py-0.5 ${
                  isPaused
                    ? 'text-amber-400 bg-amber-500/10'
                    : 'text-[#4a4a5e] bg-[#1a1a2e]'
                }`}>
                  {member.status}
                </span>
                {/* Pause button - visible when running */}
                {isRunning && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      pauseMutation.mutate(member.id);
                    }}
                    disabled={pauseMutation.isPending}
                    title="Pause agent"
                    className="p-1.5 text-[#4a4a5e] hover:text-amber-400 hover:bg-amber-500/10 rounded-xl transition-all duration-200 disabled:opacity-50"
                  >
                    {pauseMutation.isPending && pauseMutation.variables === member.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Pause className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
                {/* Resume button - visible when paused */}
                {isPaused && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      resumeMutation.mutate(member.id);
                    }}
                    disabled={resumeMutation.isPending}
                    title="Resume agent"
                    className="p-1.5 text-[#4a4a5e] hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all duration-200 disabled:opacity-50"
                  >
                    {resumeMutation.isPending && resumeMutation.variables === member.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMutation.mutate(member.id);
                  }}
                  disabled={!canRemove || removeMutation.isPending}
                  title={!canRemove ? 'Stop/resume the agent before removing' : 'Remove from team'}
                  className="p-1.5 text-[#4a4a5e] hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {removeMutation.isPending && removeMutation.variables === member.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UserMinus className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
