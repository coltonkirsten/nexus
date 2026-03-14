import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { Cpu, Plus, ChevronDown, Users, PlayCircle, StopCircle, Loader2, Menu, X, PanelRightOpen, PanelLeftOpen } from 'lucide-react';
import type { Agent, Team } from '../../types/agent';
import { listAgents, startAgent, stopAgent } from '../../api/agents';
import { listTeams } from '../../api/teams';
import { getAllUnreadCounts } from '../../api/mailbox';
import { OrchestratorProvider, useOrchestrator, useOrchestratorDispatch } from './OrchestratorContext';
import { EntityNavigator } from './EntityNavigator';
import { WorkspaceTabs } from './WorkspaceTabs';
import { InspectorPanel } from './InspectorPanel';
import { CreateAgentModal } from '../CreateAgentModal';
import { CreateTeamModal } from '../CreateTeamModal';

// Inner component that uses context
function OrchestratorInner() {
  const queryClient = useQueryClient();
  const [isCreateAgentOpen, setIsCreateAgentOpen] = useState(false);
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const { mobileNavOpen, inspectorCollapsed, navigatorCollapsed } = useOrchestrator();
  const dispatch = useOrchestratorDispatch();

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

  const closeMobileNav = () => {
    dispatch({ type: 'SET_MOBILE_NAV', payload: { open: false } });
  };

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f] overflow-hidden">
      {/* Header */}
      <header className="border-b border-[#1e1e3a] shrink-0">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Hamburger menu - mobile only */}
            <button
              onClick={() => dispatch({ type: 'SET_MOBILE_NAV', payload: { open: true } })}
              className="md:hidden p-1.5 text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Cpu className="w-6 h-6 text-indigo-400" />
            <div>
              <h1 className="text-base font-bold text-[#e0e0e8] tracking-tight">NEXUS</h1>
              <p className="text-[9px] text-[#4a4a5e] tracking-wide uppercase hidden sm:block">Agent Control System</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            {/* Nav - hidden on mobile */}
            <nav className="hidden md:flex gap-4">
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
                to="/demos"
                className={({ isActive }) =>
                  `text-xs transition-all duration-200 ${
                    isActive ? 'text-indigo-400' : 'text-[#4a4a5e] hover:text-[#7a7a8e]'
                  }`
                }
              >
                Demos
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
            {/* Bulk actions - hidden on mobile */}
            {agents.length > 0 && (
              <div className="hidden lg:flex items-center gap-2">
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
                  <span className="hidden xl:inline">Start All</span>
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
                  <span className="hidden xl:inline">Stop All</span>
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
                <span className="hidden sm:inline">Create</span>
                <ChevronDown className="w-3 h-3 hidden sm:block" />
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

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeMobileNav} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-[#0a0a0f] border-r border-[#1e1e3a] flex flex-col">
            {/* Mobile nav header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e3a]">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-400" />
                <span className="text-sm font-semibold text-[#e0e0e8]">NEXUS</span>
              </div>
              <button
                onClick={closeMobileNav}
                className="p-1.5 text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Mobile nav links */}
            <nav className="p-4 space-y-1 border-b border-[#1e1e3a]">
              <NavLink
                to="/"
                end
                onClick={closeMobileNav}
                className={({ isActive }) =>
                  `block px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                    isActive ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e]'
                  }`
                }
              >
                Orchestrator
              </NavLink>
              <NavLink
                to="/teams"
                onClick={closeMobileNav}
                className={({ isActive }) =>
                  `block px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                    isActive ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e]'
                  }`
                }
              >
                Teams
              </NavLink>
              <NavLink
                to="/volumes"
                onClick={closeMobileNav}
                className={({ isActive }) =>
                  `block px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                    isActive ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e]'
                  }`
                }
              >
                Volumes
              </NavLink>
              <NavLink
                to="/demos"
                onClick={closeMobileNav}
                className={({ isActive }) =>
                  `block px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                    isActive ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e]'
                  }`
                }
              >
                Demos
              </NavLink>
              <NavLink
                to="/settings"
                onClick={closeMobileNav}
                className={({ isActive }) =>
                  `block px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                    isActive ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e]'
                  }`
                }
              >
                Settings
              </NavLink>
            </nav>
            {/* Entity navigator in mobile overlay */}
            <div className="flex-1 overflow-hidden">
              <EntityNavigator
                agents={agents}
                teams={teams}
                unreadCounts={unreadCounts}
                isLoading={agentsLoading || teamsLoading}
                onEntitySelect={closeMobileNav}
              />
            </div>
          </div>
        </div>
      )}

      {/* Three-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Expand button when navigator is collapsed */}
        {navigatorCollapsed && (
          <div className="hidden md:flex items-start pt-2 pl-2 shrink-0 border-r border-[#1e1e3a]">
            <button
              onClick={() => dispatch({ type: 'TOGGLE_NAVIGATOR' })}
              className="p-1.5 text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
              title="Expand navigator"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Left: Entity Navigator - hidden on mobile or when collapsed */}
        {!navigatorCollapsed && (
          <div className="hidden md:block">
            <EntityNavigator
              agents={agents}
              teams={teams}
              unreadCounts={unreadCounts}
              isLoading={agentsLoading || teamsLoading}
            />
          </div>
        )}

        {/* Center: Workspace Tabs */}
        <WorkspaceTabs agents={agents} teams={teams} />

        {/* Right: Inspector Panel - hidden on mobile/tablet */}
        <div className="hidden lg:block">
          <InspectorPanel agents={agents} teams={teams} />
        </div>

        {/* Expand button when inspector is collapsed */}
        {inspectorCollapsed && (
          <div className="hidden lg:flex items-start pt-2 pr-2 shrink-0 border-l border-[#1e1e3a]">
            <button
              onClick={() => dispatch({ type: 'TOGGLE_INSPECTOR' })}
              className="p-1.5 text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
              title="Expand inspector"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <CreateAgentModal
        isOpen={isCreateAgentOpen}
        onClose={() => setIsCreateAgentOpen(false)}
      />
      <CreateTeamModal
        isOpen={isCreateTeamOpen}
        onClose={() => setIsCreateTeamOpen(false)}
      />
    </div>
  );
}

export function OrchestratorPage() {
  return (
    <OrchestratorProvider>
      <OrchestratorInner />
    </OrchestratorProvider>
  );
}
