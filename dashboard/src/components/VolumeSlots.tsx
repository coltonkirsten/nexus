import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, FolderOpen, Unlink, ChevronDown, Loader2, AlertCircle } from 'lucide-react';
import type { Agent, Volume } from '../types/agent';
import { listVolumes, attachVolume, detachVolume } from '../api/volumes';
import { ConfirmModal } from './ConfirmModal';

interface VolumeSlotsProps {
  agent: Agent;
}

function VolumeSlot({
  label,
  type,
  icon: Icon,
  volume,
  agent,
  availableVolumes,
  isDisabled,
}: {
  label: string;
  type: 'ledger' | 'workspace';
  icon: React.ComponentType<{ className?: string }>;
  volume?: Volume;
  agent: Agent;
  availableVolumes: Volume[];
  isDisabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showDetachConfirm, setShowDetachConfirm] = useState(false);

  const attachMutation = useMutation({
    mutationFn: (volumeId: string) => attachVolume(agent.id, volumeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent', agent.id] });
      queryClient.invalidateQueries({ queryKey: ['volumes'] });
      setDropdownOpen(false);
    },
  });

  const detachMutation = useMutation({
    mutationFn: () => detachVolume(agent.id, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent', agent.id] });
      queryClient.invalidateQueries({ queryKey: ['volumes'] });
    },
  });

  const isLoading = attachMutation.isPending || detachMutation.isPending;

  return (
    <div className="flex items-center justify-between p-4 bg-[#12121a] border border-[#1e1e3a] rounded-xl">
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="w-4 h-4 text-indigo-400 shrink-0" />
        <div className="min-w-0">
          <span className="text-xs text-[#7a7a8e] block">{label}</span>
          {volume ? (
            <span className="text-sm text-[#e0e0e8] truncate block">{volume.name}</span>
          ) : (
            <span className="text-sm text-[#4a4a5e] italic">No volume attached</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />}

        {/* Detach button */}
        {volume && (
          <button
            onClick={() => setShowDetachConfirm(true)}
            disabled={isDisabled || isLoading}
            className="p-1.5 text-[#4a4a5e] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            title={isDisabled ? 'Stop agent to detach' : 'Detach volume'}
          >
            <Unlink className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Change dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={isDisabled || isLoading}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#7a7a8e] hover:text-[#e0e0e8] border border-[#1e1e3a] hover:border-[#2a2a4a] rounded-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            title={isDisabled ? 'Stop agent to change volumes' : 'Change volume'}
          >
            Change
            <ChevronDown className="w-3 h-3" />
          </button>

          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-[#12121a] border border-[#1e1e3a] rounded-xl shadow-xl overflow-hidden">
                {availableVolumes.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-[#4a4a5e]">No available {type} volumes</div>
                ) : (
                  availableVolumes.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => attachMutation.mutate(v.id)}
                      className="w-full text-left px-3 py-2 text-sm text-[#e0e0e8] hover:bg-[#1a1a2e] transition-colors"
                    >
                      <span className="block truncate">{v.name}</span>
                      {v.description && (
                        <span className="block text-xs text-[#4a4a5e] truncate">{v.description}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showDetachConfirm}
        onClose={() => setShowDetachConfirm(false)}
        onConfirm={() => {
          setShowDetachConfirm(false);
          detachMutation.mutate();
        }}
        title={`Detach ${label}`}
        message={`Are you sure you want to detach "${volume?.name}" from this agent? The volume will be preserved and can be attached to other agents.`}
        confirmLabel="Detach"
        variant="warning"
      />
    </div>
  );
}

export function VolumeSlots({ agent }: VolumeSlotsProps) {
  const { data: allVolumes = [] } = useQuery({
    queryKey: ['volumes'],
    queryFn: () => listVolumes(),
  });

  const isRunning = agent.status === 'running' || agent.status === 'starting';

  const ledgerVolume = allVolumes.find((v) => v.id === agent.ledgerVolumeId);
  const workspaceVolume = allVolumes.find((v) => v.id === agent.workspaceVolumeId);

  // Available = detached volumes of matching type (not currently attached)
  const availableLedgers = allVolumes.filter(
    (v) => v.type === 'ledger' && !v.attachedTo && v.id !== agent.ledgerVolumeId
  );
  const availableWorkspaces = allVolumes.filter(
    (v) => v.type === 'workspace' && !v.attachedTo && v.id !== agent.workspaceVolumeId
  );

  return (
    <div className="space-y-3">
      {isRunning && (
        <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
          <AlertCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          <span className="text-xs text-yellow-400">Stop the agent to change volume attachments</span>
        </div>
      )}
      <VolumeSlot
        label="Ledger"
        type="ledger"
        icon={BookOpen}
        volume={ledgerVolume}
        agent={agent}
        availableVolumes={availableLedgers}
        isDisabled={isRunning}
      />
      <VolumeSlot
        label="Workspace"
        type="workspace"
        icon={FolderOpen}
        volume={workspaceVolume}
        agent={agent}
        availableVolumes={availableWorkspaces}
        isDisabled={isRunning}
      />
    </div>
  );
}
