import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Cpu, Play, Square, Trash2, Pencil, Check, X, Loader2 } from 'lucide-react';
import type { Agent } from '../types/agent';
import { listAgents, startAgent, stopAgent, deleteAgent, renameAgent } from '../api/agents';
import { CreateAgentModal } from './CreateAgentModal';
import { ConfirmModal } from './ConfirmModal';

function AgentCard({ agent }: { agent: Agent }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(agent.name);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isRunning = agent.status === 'running';
  const isTransitioning = agent.status === 'starting' || agent.status === 'stopping';

  const statusColors: Record<string, string> = {
    running: 'bg-emerald-400',
    starting: 'bg-yellow-400',
    stopping: 'bg-yellow-400',
    stopped: 'bg-red-400',
    error: 'bg-red-400',
    created: 'bg-[#4a4a5e]',
  };

  const statusLabels: Record<string, string> = {
    running: 'Running',
    starting: 'Starting',
    stopping: 'Stopping',
    stopped: 'Stopped',
    error: 'Error',
    created: 'Created',
  };

  const startMutation = useMutation({
    mutationFn: () => startAgent(agent.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => stopAgent(agent.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAgent(agent.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => renameAgent(agent.id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setIsRenaming(false);
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleStartStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunning) {
      stopMutation.mutate();
    } else {
      startMutation.mutate();
    }
  };

  const handleRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRenaming && newName.trim() && newName !== agent.name) {
      renameMutation.mutate(newName.trim());
    } else {
      setIsRenaming(true);
      setNewName(agent.name);
    }
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRenaming(false);
    setNewName(agent.name);
  };

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
    <div
      onClick={() => navigate(`/agent/${agent.id}`)}
      className="group bg-[#12121a] border border-[#1e1e3a] rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:border-[#2a2a4a] hover:shadow-lg hover:shadow-indigo-500/5 hover:scale-[1.01]"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-2.5 h-2.5 rounded-full ${statusColors[agent.status] || 'bg-[#4a4a5e]'} ${isRunning ? 'animate-pulse' : ''}`} />
          {isRenaming ? (
            <div className="flex items-center gap-1.5 flex-1" onClick={e => e.stopPropagation()}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-[#0f0f18] border border-[#1e1e3a] rounded-lg px-2 py-1 text-sm text-[#e0e0e8] focus:outline-none focus:border-indigo-500 flex-1 min-w-0"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(e as unknown as React.MouseEvent);
                  if (e.key === 'Escape') handleCancelRename(e as unknown as React.MouseEvent);
                }}
              />
              <button onClick={handleRename} className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded-lg">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleCancelRename} className="p-1 text-[#4a4a5e] hover:bg-[#1a1a2e] rounded-lg">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <h3 className="text-sm font-semibold text-[#e0e0e8] truncate">{agent.name}</h3>
          )}
        </div>
        <span className="text-[10px] text-[#4a4a5e] rounded-full px-2.5 py-0.5 bg-[#1a1a2e] shrink-0 ml-2">
          {statusLabels[agent.status] || agent.status}
        </span>
      </div>

      {/* Meta */}
      <div className="space-y-1.5 mb-4">
        <p className="text-[10px] text-[#4a4a5e] font-mono">ID: {agent.id.slice(0, 8)}</p>
        <p className="text-[10px] text-[#4a4a5e]">Last activity: {formatTime(agent.lastActivity)}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={handleStartStop}
          disabled={isTransitioning || startMutation.isPending || stopMutation.isPending}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl border transition-all duration-200 disabled:opacity-50 ${
            isRunning
              ? 'text-red-400 border-red-800/50 hover:bg-red-500/10'
              : 'text-emerald-400 border-emerald-800/50 hover:bg-emerald-500/10'
          }`}
        >
          {(startMutation.isPending || stopMutation.isPending) ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : isRunning ? (
            <Square className="w-3 h-3" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          {isRunning ? 'Stop' : 'Start'}
        </button>
        {!isRenaming && (
          <button
            onClick={handleRename}
            className="p-1.5 text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200"
            title="Rename"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="p-1.5 text-[#4a4a5e] hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-200 disabled:opacity-50"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          deleteMutation.mutate();
        }}
        title="Delete Agent"
        message={`Are you sure you want to delete "${agent.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}

export function AgentOverview() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data: agents = [], isLoading, error } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: listAgents,
    refetchInterval: 5000,
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
            Create Agent
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400 mx-auto mb-4" />
              <p className="text-[#4a4a5e] text-sm">Loading agents...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <p className="text-red-400 text-sm mb-2">Failed to load agents</p>
              <p className="text-[#4a4a5e] text-xs">Check that the API server is running</p>
            </div>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <Cpu className="w-16 h-16 mx-auto mb-4 text-[#1e1e3a]" />
              <h2 className="text-lg font-semibold text-[#7a7a8e] mb-2">No agents yet</h2>
              <p className="text-sm text-[#4a4a5e] mb-6">Create your first autonomous agent to get started</p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 transition-all duration-200 mx-auto"
              >
                <Plus className="w-4 h-4" />
                Create Agent
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </main>

      <CreateAgentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}
