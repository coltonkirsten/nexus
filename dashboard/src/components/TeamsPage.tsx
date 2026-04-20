import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, NavLink } from 'react-router-dom';
import { Plus, Cpu, Users, Trash2, Mail, Menu, X } from 'lucide-react';
import type { Team } from '../types/agent';
import { listTeams, deleteTeam, getTeamMembers } from '../api/teams';
import { getAllUnreadCounts } from '../api/mailbox';
import { CreateTeamModal } from './CreateTeamModal';
import { ConfirmModal } from './ConfirmModal';

function TeamCard({ team, unreadCount = 0 }: { team: Team; unreadCount?: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ['team-members', team.id],
    queryFn: () => getTeamMembers(team.id),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTeam(team.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['teams'] });
      const prev = queryClient.getQueryData<Team[]>(['teams']);
      queryClient.setQueryData<Team[]>(['teams'], (old) =>
        (old || []).filter((t) => t.id !== team.id)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['teams'], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['teams'] }),
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div
      onClick={() => navigate(`/team/${team.id}`)}
      className="group bg-[#12121a] border border-[#1e1e3a] rounded-2xl p-4 md:p-6 cursor-pointer transition-all duration-200 hover:border-[#2a2a4a] hover:shadow-lg hover:shadow-indigo-500/5 active:scale-[0.98] md:hover:scale-[1.01]"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Users className="w-4 h-4 text-indigo-400 shrink-0" />
          <h3 className="text-sm font-semibold text-[#e0e0e8] truncate">{team.name}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {unreadCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 rounded-full px-2 py-0.5">
              <Mail className="w-3 h-3" />
              {unreadCount}
            </span>
          )}
          <span className="text-[10px] text-indigo-400 bg-indigo-500/10 rounded-full px-2.5 py-0.5">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Meta */}
      <div className="space-y-1 mb-4">
        {team.description && (
          <p className="text-xs text-[#7a7a8e] truncate">{team.description}</p>
        )}
        <p className="text-[10px] text-[#4a4a5e]">Created: {formatDate(team.createdAt)}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
          disabled={deleteMutation.isPending}
          className="p-1.5 text-[#4a4a5e] hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-200 disabled:opacity-50"
          title="Delete team"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <ConfirmModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            deleteMutation.mutate();
          }}
          title="Delete Team"
          message={`Are you sure you want to delete "${team.name}"? The team must have no members. The team's shared drive volume will be removed.`}
          confirmLabel="Delete"
          variant="danger"
        />
      </div>
    </div>
  );
}

export function TeamsPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: teams = [], isLoading, error } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: listTeams,
    refetchInterval: 5000,
  });

  const { data: unreadCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['mailbox-unread-counts'],
    queryFn: getAllUnreadCounts,
    refetchInterval: 10000,
  });

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <header className="border-b border-[#1e1e3a]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 md:py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1.5 text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Cpu className="w-6 md:w-7 h-6 md:h-7 text-indigo-400" />
            <div>
              <h1 className="text-lg md:text-xl font-bold text-[#e0e0e8] tracking-tight">NEXUS</h1>
              <p className="text-[9px] md:text-[10px] text-[#4a4a5e] tracking-wide uppercase hidden sm:block">Agent Control System</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create Team</span>
          </button>
        </div>
        {/* Nav tabs - hidden on mobile */}
        <div className="max-w-7xl mx-auto px-4 md:px-8 hidden md:block">
          <nav className="flex gap-6">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `pb-3 text-sm transition-all duration-200 border-b-2 ${
                  isActive
                    ? 'text-indigo-400 border-indigo-400'
                    : 'text-[#4a4a5e] border-transparent hover:text-[#7a7a8e]'
                }`
              }
            >
              Orchestrator
            </NavLink>
            <NavLink
              to="/teams"
              className={({ isActive }) =>
                `pb-3 text-sm transition-all duration-200 border-b-2 ${
                  isActive
                    ? 'text-indigo-400 border-indigo-400'
                    : 'text-[#4a4a5e] border-transparent hover:text-[#7a7a8e]'
                }`
              }
            >
              Teams
            </NavLink>
            <NavLink
              to="/volumes"
              className={({ isActive }) =>
                `pb-3 text-sm transition-all duration-200 border-b-2 ${
                  isActive
                    ? 'text-indigo-400 border-indigo-400'
                    : 'text-[#4a4a5e] border-transparent hover:text-[#7a7a8e]'
                }`
              }
            >
              Volumes
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `pb-3 text-sm transition-all duration-200 border-b-2 ${
                  isActive
                    ? 'text-indigo-400 border-indigo-400'
                    : 'text-[#4a4a5e] border-transparent hover:text-[#7a7a8e]'
                }`
              }
            >
              Settings
            </NavLink>
          </nav>
        </div>
      </header>

      {/* Mobile nav overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-[#0a0a0f] border-r border-[#1e1e3a] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e3a]">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-400" />
                <span className="text-sm font-semibold text-[#e0e0e8]">NEXUS</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-4 space-y-1">
              <NavLink
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `block px-3 py-2.5 text-sm rounded-lg transition-all duration-200 ${
                    isActive ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e]'
                  }`
                }
              >
                Orchestrator
              </NavLink>
              <NavLink
                to="/teams"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `block px-3 py-2.5 text-sm rounded-lg transition-all duration-200 ${
                    isActive ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e]'
                  }`
                }
              >
                Teams
              </NavLink>
              <NavLink
                to="/volumes"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `block px-3 py-2.5 text-sm rounded-lg transition-all duration-200 ${
                    isActive ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e]'
                  }`
                }
              >
                Volumes
              </NavLink>
              <NavLink
                to="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `block px-3 py-2.5 text-sm rounded-lg transition-all duration-200 ${
                    isActive ? 'text-indigo-400 bg-indigo-500/10' : 'text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e]'
                  }`
                }
              >
                Settings
              </NavLink>
            </nav>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400 mx-auto mb-4" />
              <p className="text-[#4a4a5e] text-sm">Loading teams...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <p className="text-red-400 text-sm mb-2">Failed to load teams</p>
              <p className="text-[#4a4a5e] text-xs">Check that the API server is running</p>
            </div>
          </div>
        ) : teams.length === 0 ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <Users className="w-16 h-16 mx-auto mb-4 text-[#1e1e3a]" />
              <h2 className="text-lg font-semibold text-[#7a7a8e] mb-2">No teams yet</h2>
              <p className="text-sm text-[#4a4a5e] mb-6">Create a team to group agents with isolated communication</p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 transition-all duration-200 mx-auto"
              >
                <Plus className="w-4 h-4" />
                Create Team
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {teams.map((team) => (
              <TeamCard key={team.id} team={team} unreadCount={unreadCounts[team.id] || 0} />
            ))}
          </div>
        )}
      </main>

      <CreateTeamModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}
