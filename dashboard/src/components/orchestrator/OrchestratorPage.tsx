import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { Cpu, Plus, ChevronDown, Users, PlayCircle, StopCircle, Loader2 } from 'lucide-react';
import type { Agent, Team } from '../../types/agent';
import { listAgents, startAgent, stopAgent } from '../../api/agents';
import { listTeams } from '../../api/teams';
import { getAllUnreadCounts } from '../../api/mailbox';
import { OrchestratorProvider } from './OrchestratorContext';
import { EntityNavigator } from './EntityNavigator';
import { WorkspaceTabs } from './WorkspaceTabs';
import { InspectorPanel } from './InspectorPanel';
import { CreateAgentModal } from '../CreateAgentModal';
import { CreateTeamModal } from '../CreateTeamModal';

export function OrchestratorPage() {
  const queryClient = useQueryClient();
  const [isCreateAgentOpen, setIsCreateAgentOpen] = useState(false);
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const { data: agents = [], isLoading: agentsLoading } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: listAgents,
    refetchInterval: 5000,
  });

  const { data: teams = [], isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: listTeams,
    refetchInterval: 5000,
  });

  const { data: unreadCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['mailbox-unread-counts'],
    queryFn: getAllUnreadCounts,
    refetchInterval: 10000,
  });

  // Compute running/stopped agents for bulk actions
  const runningAgents = agents.filter(a => a.status === 'running');
  const stoppedAgents = agents.filter(a => a.status === 'stopped' || a.status === 'created');

  // Start All mutation
  const startAllMutation = useMutation({
    mutationFn: async () => {
      for (const agent of stoppedAgents) {
        await startAgent(agent.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  // Stop All mutation
  const stopAllMutation = useMutation({
    mutationFn: async () => {
      for (const agent of runningAgents) {
        await stopAgent(agent.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const isBatchRunning = startAllMutation.isPending || stopAllMutation.isPending;

  return (
    <OrchestratorProvider>
      <div className="h-screen flex flex-col bg-[#0a0a0f] overflow-hidden">
        {/* Header */}
        <header className="border-b border-[#1e1e3a] shrink-0">
          <div className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cpu className="w-6 h-6 text-indigo-400" />
              <div>
                <h1 className="text-base font-bold text-[#e0e0e8] tracking-tight">NEXUS</h1>
                <p className="text-[9px] text-[#4a4a5e] tracking-wide uppercase">Agent Control System</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Nav */}
              <nav className="flex gap-4">
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `text-xs transition-all duration-200 ${
                      isActive ? 'text-indigo-400' : 'text-[#4a4a5e] hover:text-[#7a7a8e]'
                    }`
                  }
                >
                  Orchestrator
                </NavLink>
                <NavLink
                  to="/teams"
                  className={({ isActive }) =>
                    `text-xs transition-all duration-200 ${
                      isActive ? 'text-indigo-400' : 'text-[#4a4a5e] hover:text-[#7a7a8e]'
                    }`
                  }
                >
                  Teams
                </NavLink>
                <NavLink
                  to="/volumes"
                  className={({ isActive }) =>
                    `text-xs transition-all duration-200 ${
                      isActive ? 'text-indigo-400' : 'text-[#4a4a5e] hover:text-[#7a7a8e]'
                    }`
                  }
                >
                  Volumes
                </NavLink>
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    `text-xs transition-all duration-200 ${
                      isActive ? 'text-indigo-400' : 'text-[#4a4a5e] hover:text-[#7a7a8e]'
                    }`
                  }
                >
                  Settings
                </NavLink>
              </nav>
              {/* Bulk actions */}
              {agents.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startAllMutation.mutate()}
                    disabled={isBatchRunning || stoppedAgents.length === 0}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-emerald-400 border border-emerald-800/50 text-xs rounded-lg hover:bg-emerald-500/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={`Start ${stoppedAgents.length} stopped agent(s)`}
                  >
                    {startAllMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PlayCircle className="w-3.5 h-3.5" />
                    )}
                    Start All
                  </button>
                  <button
                    onClick={() => stopAllMutation.mutate()}
                    disabled={isBatchRunning || runningAgents.length === 0}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-red-400 border border-red-800/50 text-xs rounded-lg hover:bg-red-500/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={`Stop ${runningAgents.length} running agent(s)`}
                  >
                    {stopAllMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <StopCircle className="w-3.5 h-3.5" />
                    )}
                    Stop All
                  </button>
                </div>
              )}
              {/* Create dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowCreateMenu(!showCreateMenu)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-500 transition-all duration-200"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showCreateMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowCreateMenu(false)} />
                    <div className="absolute right-0 mt-1 w-40 bg-[#12121a] border border-[#1e1e3a] rounded-xl shadow-xl z-50 py-1">
                      <button
                        onClick={() => { setIsCreateAgentOpen(true); setShowCreateMenu(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#e0e0e8] hover:bg-[#1a1a2e] transition-colors"
                      >
                        <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                        New Agent
                      </button>
                      <button
                        onClick={() => { setIsCreateTeamOpen(true); setShowCreateMenu(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#e0e0e8] hover:bg-[#1a1a2e] transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-indigo-400" />
                        New Team
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Three-column layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Entity Navigator */}
          <EntityNavigator
            agents={agents}
            teams={teams}
            unreadCounts={unreadCounts}
            isLoading={agentsLoading || teamsLoading}
          />

          {/* Center: Workspace Tabs */}
          <WorkspaceTabs agents={agents} teams={teams} />

          {/* Right: Inspector Panel */}
          <InspectorPanel agents={agents} teams={teams} />
        </div>
      </div>

      <CreateAgentModal
        isOpen={isCreateAgentOpen}
        onClose={() => setIsCreateAgentOpen(false)}
      />
      <CreateTeamModal
        isOpen={isCreateTeamOpen}
        onClose={() => setIsCreateTeamOpen(false)}
      />
    </OrchestratorProvider>
  );
}
