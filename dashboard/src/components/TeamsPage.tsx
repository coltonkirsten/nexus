import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, NavLink } from 'react-router-dom';
import { Plus, Cpu, Users, Trash2, Mail } from 'lucide-react';
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teams'] }),
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
      className="group bg-[#12121a] border border-[#1e1e3a] rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:border-[#2a2a4a] hover:shadow-lg hover:shadow-indigo-500/5 hover:scale-[1.01]"
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
        <div className="max-w-7xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="w-7 h-7 text-indigo-400" />
            <div>
              <h1 className="text-xl font-bold text-[#e0e0e8] tracking-tight">NEXUS</h1>
              <p className="text-[10px] text-[#4a4a5e] tracking-wide uppercase">Agent Control System</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            Create Team
          </button>
        </div>
        {/* Nav tabs */}
        <div className="max-w-7xl mx-auto px-8">
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
              Agents
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

      {/* Content */}
      <main className="max-w-7xl mx-auto px-8 py-8">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
