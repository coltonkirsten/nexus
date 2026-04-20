import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import {
  Cpu,
  HardDrive,
  Plus,
  Copy,
  Trash2,
  BookOpen,
  FolderOpen,
  Loader2,
  X,
  Menu,
} from 'lucide-react';
import type { Volume, VolumeType } from '../types/agent';
import { listVolumes, createVolume, deleteVolume, cloneVolume } from '../api/volumes';
import { listAgents } from '../api/agents';
import { ConfirmModal } from './ConfirmModal';

type FilterTab = 'all' | 'ledger' | 'workspace';

function CreateVolumeModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<VolumeType>('ledger');
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => createVolume({ name: name.trim(), type, description: description.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volumes'] });
      setName('');
      setType('ledger');
      setDescription('');
      onClose();
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 md:mx-0 bg-[#12121a] rounded-2xl shadow-2xl border border-[#1e1e3a]">
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#1e1e3a]">
          <h3 className="text-sm font-semibold text-[#e0e0e8]">Create Volume</h3>
          <button onClick={onClose} className="p-1 text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) createMutation.mutate(); }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-xs text-[#7a7a8e] mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-ledger"
              className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] placeholder-[#4a4a5e] text-sm focus:outline-none focus:border-indigo-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-[#7a7a8e] mb-1.5">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as VolumeType)}
              className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="ledger">Ledger</option>
              <option value="workspace">Workspace</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#7a7a8e] mb-1.5">Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this volume for?"
              className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] placeholder-[#4a4a5e] text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          {createMutation.isError && (
            <p className="text-xs text-red-400">Failed to create volume.</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl text-sm transition-all duration-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createMutation.isPending}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CloneVolumeModal({
  isOpen,
  onClose,
  sourceVolume,
}: {
  isOpen: boolean;
  onClose: () => void;
  sourceVolume: Volume | null;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();

  const cloneMutation = useMutation({
    mutationFn: () => cloneVolume(sourceVolume!.id, name.trim(), description.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volumes'] });
      setName('');
      setDescription('');
      onClose();
    },
  });

  if (!isOpen || !sourceVolume) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 md:mx-0 bg-[#12121a] rounded-2xl shadow-2xl border border-[#1e1e3a]">
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-[#1e1e3a]">
          <h3 className="text-sm font-semibold text-[#e0e0e8]">Clone "{sourceVolume.name}"</h3>
          <button onClick={onClose} className="p-1 text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) cloneMutation.mutate(); }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-xs text-[#7a7a8e] mb-1.5">Clone Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${sourceVolume.name}-copy`}
              className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] placeholder-[#4a4a5e] text-sm focus:outline-none focus:border-indigo-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-[#7a7a8e] mb-1.5">Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Clone description"
              className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] placeholder-[#4a4a5e] text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          {cloneMutation.isError && (
            <p className="text-xs text-red-400">Failed to clone volume.</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl text-sm transition-all duration-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || cloneMutation.isPending}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {cloneMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Clone
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VolumeCard({ volume, agentName }: { volume: Volume; agentName?: string }) {
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteVolume(volume.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['volumes'] }),
  });

  const isAttached = !!volume.attachedTo;
  const TypeIcon = volume.type === 'ledger' ? BookOpen : FolderOpen;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="group bg-[#12121a] border border-[#1e1e3a] rounded-2xl p-4 md:p-6 transition-all duration-200 hover:border-[#2a2a4a]">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <TypeIcon className="w-4 h-4 text-indigo-400 shrink-0" />
          <h3 className="text-sm font-semibold text-[#e0e0e8] truncate">{volume.name}</h3>
        </div>
        <span className={`text-[10px] rounded-full px-2.5 py-0.5 shrink-0 ml-2 ${
          volume.type === 'ledger'
            ? 'bg-indigo-500/10 text-indigo-400'
            : 'bg-emerald-500/10 text-emerald-400'
        }`}>
          {volume.type}
        </span>
      </div>

      {/* Meta */}
      <div className="space-y-1 mb-4">
        {volume.description && (
          <p className="text-xs text-[#7a7a8e] truncate">{volume.description}</p>
        )}
        <p className="text-[10px] text-[#4a4a5e]">
          {isAttached ? (
            <>Attached to: <span className="text-indigo-400">{agentName || volume.attachedTo?.slice(0, 8)}</span></>
          ) : (
            <span className="text-yellow-400/70">Detached</span>
          )}
        </p>
        <p className="text-[10px] text-[#4a4a5e]">Created: {formatDate(volume.createdAt)}</p>
        {volume.clonedFrom && (
          <p className="text-[10px] text-[#4a4a5e]">Cloned from another volume</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={() => setShowCloneModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#7a7a8e] hover:text-[#e0e0e8] border border-[#1e1e3a] hover:border-[#2a2a4a] rounded-xl transition-all duration-200"
        >
          <Copy className="w-3 h-3" />
          Clone
        </button>
        {!isAttached && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleteMutation.isPending}
            className="p-1.5 text-[#4a4a5e] hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-200 disabled:opacity-50"
            title="Delete volume"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          deleteMutation.mutate();
        }}
        title="Delete Volume"
        message={`Are you sure you want to delete "${volume.name}"? All data in this volume will be permanently lost.`}
        confirmLabel="Delete"
        variant="danger"
      />

      <CloneVolumeModal
        isOpen={showCloneModal}
        onClose={() => setShowCloneModal(false)}
        sourceVolume={volume}
      />
    </div>
  );
}

export function VolumesPage() {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: volumes = [], isLoading, error } = useQuery({
    queryKey: ['volumes'],
    queryFn: () => listVolumes(),
    refetchInterval: 2000,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: listAgents,
  });

  // Build agent name lookup
  const agentNameMap = new Map(agents.map((a) => [a.id, a.name]));

  const filteredVolumes = filter === 'all' ? volumes : volumes.filter((v) => v.type === filter);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'ledger', label: 'Ledgers' },
    { key: 'workspace', label: 'Workspaces' },
  ];

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
            <span className="hidden sm:inline">Create Volume</span>
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

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8">
        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3.5 py-1.5 text-xs rounded-xl border transition-all duration-200 ${
                filter === tab.key
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                  : 'border-[#1e1e3a] text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400 mx-auto mb-4" />
              <p className="text-[#4a4a5e] text-sm">Loading volumes...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <p className="text-red-400 text-sm mb-2">Failed to load volumes</p>
              <p className="text-[#4a4a5e] text-xs">Check that the API server is running</p>
            </div>
          </div>
        ) : filteredVolumes.length === 0 ? (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <HardDrive className="w-16 h-16 mx-auto mb-4 text-[#1e1e3a]" />
              <h2 className="text-lg font-semibold text-[#7a7a8e] mb-2">No volumes yet</h2>
              <p className="text-sm text-[#4a4a5e] mb-6">Create a volume or create an agent to get started</p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 transition-all duration-200 mx-auto"
              >
                <Plus className="w-4 h-4" />
                Create Volume
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {filteredVolumes.map((volume) => (
              <VolumeCard
                key={volume.id}
                volume={volume}
                agentName={volume.attachedTo ? agentNameMap.get(volume.attachedTo) : undefined}
              />
            ))}
          </div>
        )}
      </main>

      <CreateVolumeModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}
