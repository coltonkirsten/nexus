import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Square,
  Loader2,
  ExternalLink,
  Clock,
  Wrench,
  History,
  Timer,
  Trash2,
  RotateCw,
  Pause,
} from 'lucide-react';
import type { Agent } from '../../types/agent';
import { startAgent, stopAgent, deleteAgent, rebuildAgent, getAgentHistory, listCronJobs, pauseAgent, resumeAgent, type Invocation } from '../../api/agents';
import { ConfirmModal } from '../ConfirmModal';
import type { CronJob } from '../../types/agent';
import { useOrchestratorDispatch } from './OrchestratorContext';

const statusColors: Record<string, string> = {
  running: 'bg-emerald-400',
  starting: 'bg-yellow-400',
  stopping: 'bg-yellow-400',
  stopped: 'bg-red-400',
  paused: 'bg-amber-400',
  error: 'bg-red-400',
  created: 'bg-[#4a4a5e]',
};

const statusLabels: Record<string, string> = {
  running: 'Running',
  starting: 'Starting',
  stopping: 'Stopping',
  stopped: 'Stopped',
  paused: 'Paused',
  error: 'Error',
  created: 'Created',
};

function formatTime(dateStr?: string) {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function AgentInspector({ agent }: { agent: Agent }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dispatch = useOrchestratorDispatch();
  const isRunning = agent.status === 'running';
  const isPaused = agent.status === 'paused';
  const isTransitioning = agent.status === 'starting' || agent.status === 'stopping' || agent.status === 'rebuilding';

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false);
  const [deleteVolumesToo, setDeleteVolumesToo] = useState(false);

  const rebuildMutation = useMutation({
    mutationFn: () => rebuildAgent(agent.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setShowRebuildConfirm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (deleteVols: boolean) => deleteAgent(agent.id, deleteVols),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['agents'] });
      const prev = queryClient.getQueryData<Agent[]>(['agents']);
      queryClient.setQueryData<Agent[]>(['agents'], (old) =>
        (old || []).filter((a) => a.id !== agent.id)
      );
      dispatch({ type: 'CLOSE_TAB_BY_ENTITY', payload: { entityId: agent.id } });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['agents'], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['volumes'] });
    },
  });

  const startMutation = useMutation({
    mutationFn: () => startAgent(agent.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['agents'] });
      const prev = queryClient.getQueryData<Agent[]>(['agents']);
      queryClient.setQueryData<Agent[]>(['agents'], (old) =>
        (old || []).map((a) => (a.id === agent.id ? { ...a, status: 'starting' } : a))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['agents'], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => stopAgent(agent.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['agents'] });
      const prev = queryClient.getQueryData<Agent[]>(['agents']);
      queryClient.setQueryData<Agent[]>(['agents'], (old) =>
        (old || []).map((a) => (a.id === agent.id ? { ...a, status: 'stopping' } : a))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['agents'], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const pauseMutation = useMutation({
    mutationFn: () => pauseAgent(agent.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeAgent(agent.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  const { data: historyData } = useQuery({
    queryKey: ['agent-history', agent.id],
    queryFn: () => getAgentHistory(agent.id),
    refetchInterval: 10000,
  });

  const { data: cronJobs = [] } = useQuery<CronJob[]>({
    queryKey: ['cron-jobs', agent.id],
    queryFn: () => listCronJobs(agent.id),
    refetchInterval: 10000,
  });

  const recentHistory = (historyData?.invocations || []).slice(-3).reverse();
  const enabledCrons = cronJobs.filter((j) => j.enabled);

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div
            className={`w-2.5 h-2.5 rounded-full ${statusColors[agent.status] || 'bg-[#4a4a5e]'} ${
              isRunning ? 'animate-pulse' : ''
            }`}
          />
          <h3 className="text-sm font-semibold text-[#e0e0e8] truncate">{agent.name}</h3>
        </div>
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#4a4a5e]">Status</span>
            <span className="text-[10px] text-[#7a7a8e]">{statusLabels[agent.status] || agent.status}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#4a4a5e]">ID</span>
            <span className="text-[10px] text-[#7a7a8e] font-mono">{agent.id.slice(0, 12)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#4a4a5e]">Cell Type</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              agent.cellType === 'cli'
                ? 'bg-purple-500/10 text-purple-400'
                : 'bg-indigo-500/10 text-indigo-400'
            }`}>
              {agent.cellType === 'cli' ? 'CLI' : 'SDK'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#4a4a5e]">Last Activity</span>
            <span className="text-[10px] text-[#7a7a8e]">{formatTime(agent.lastActivity)}</span>
          </div>
        </div>
        {/* Paused state indicator */}
        {isPaused && (
          <div className="mb-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-xs text-amber-400">
              Agent is paused
              {agent.pauseReason === 'oauth_expired' && ' - OAuth token expired'}
              {agent.pausedMessageIds && agent.pausedMessageIds.length > 0 && (
                <span className="ml-1">({agent.pausedMessageIds.length} message(s) waiting)</span>
              )}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {/* Start/Stop button */}
          {!isPaused && (
            <button
              onClick={() => (isRunning ? stopMutation.mutate() : startMutation.mutate())}
              disabled={isTransitioning || startMutation.isPending || stopMutation.isPending}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all duration-200 disabled:opacity-50 ${
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
          )}
          {/* Pause button - visible when running */}
          {isRunning && (
            <button
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-400 border border-amber-800/50 hover:bg-amber-500/10 rounded-lg transition-all duration-200 disabled:opacity-50"
            >
              {pauseMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Pause className="w-3 h-3" />
              )}
              Pause
            </button>
          )}
          {/* Resume button - visible when paused */}
          {isPaused && (
            <button
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-400 border border-emerald-800/50 hover:bg-emerald-500/10 rounded-lg transition-all duration-200 disabled:opacity-50"
            >
              {resumeMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              Resume
            </button>
          )}
          <button
            onClick={() => setShowRebuildConfirm(true)}
            disabled={rebuildMutation.isPending || isTransitioning || isPaused}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-400 border border-amber-800/50 hover:bg-amber-500/10 rounded-lg transition-all duration-200 disabled:opacity-50"
          >
            {rebuildMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCw className="w-3 h-3" />
            )}
            Rebuild
          </button>
          <button
            onClick={() => navigate(`/agent/${agent.id}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#7a7a8e] hover:text-[#e0e0e8] border border-[#1e1e3a] hover:border-[#2a2a4a] rounded-lg transition-all duration-200"
          >
            <ExternalLink className="w-3 h-3" />
            Full View
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 border border-red-800/50 hover:bg-red-500/10 rounded-lg transition-all duration-200"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>

        {/* Rebuild Confirmation Modal */}
        <ConfirmModal
          isOpen={showRebuildConfirm}
          onClose={() => setShowRebuildConfirm(false)}
          onConfirm={() => rebuildMutation.mutate()}
          title="Rebuild Container"
          message="This will recreate the container with fresh credentials. The agent will be stopped and restarted. Continue?"
          confirmLabel="Rebuild"
          variant="warning"
        />

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
      </div>

      {/* Config Summary */}
      {agent.config && (
        <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
          <h4 className="text-xs font-medium text-[#e0e0e8] mb-2 flex items-center gap-1.5">
            <Wrench className="w-3 h-3 text-indigo-400" />
            Config
          </h4>
          <div className="space-y-1.5">
            {agent.config.model && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#4a4a5e]">Model</span>
                <span className="text-[10px] text-[#7a7a8e]">{agent.config.model}</span>
              </div>
            )}
            {agent.config.allowedTools && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#4a4a5e]">Tools</span>
                <span className="text-[10px] text-[#7a7a8e]">{agent.config.allowedTools.length} allowed</span>
              </div>
            )}
            {agent.config.maxTurns && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#4a4a5e]">Max Turns</span>
                <span className="text-[10px] text-[#7a7a8e]">{agent.config.maxTurns}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent History */}
      <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
        <h4 className="text-xs font-medium text-[#e0e0e8] mb-2 flex items-center gap-1.5">
          <History className="w-3 h-3 text-indigo-400" />
          Recent History
        </h4>
        {recentHistory.length === 0 ? (
          <p className="text-[10px] text-[#4a4a5e]">No invocations yet</p>
        ) : (
          <div className="space-y-2">
            {recentHistory.map((inv: Invocation) => (
              <div key={inv.id} className="border-l-2 border-[#1e1e3a] pl-3 py-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                    inv.status === 'success'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : inv.status === 'error'
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-yellow-500/10 text-yellow-400'
                  }`}>
                    {inv.status}
                  </span>
                  <span className="text-[9px] text-[#4a4a5e]">{formatTime(inv.timestamp)}</span>
                </div>
                <p className="text-[10px] text-[#7a7a8e] truncate">{inv.input || 'No input'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Cron Jobs */}
      {enabledCrons.length > 0 && (
        <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
          <h4 className="text-xs font-medium text-[#e0e0e8] mb-2 flex items-center gap-1.5">
            <Timer className="w-3 h-3 text-indigo-400" />
            Active Cron Jobs
          </h4>
          <div className="space-y-2">
            {enabledCrons.map((job) => (
              <div key={job.id} className="border-l-2 border-indigo-500/30 pl-3 py-1">
                <p className="text-[10px] text-[#e0e0e8] font-medium">{job.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] text-[#4a4a5e]">
                    {job.schedule.kind === 'cron'
                      ? job.schedule.expression
                      : job.schedule.kind === 'every'
                      ? `every ${Math.round(job.schedule.intervalMs / 60000)}m`
                      : `at ${job.schedule.datetime}`}
                  </span>
                  {job.nextRunAt && (
                    <span className="text-[9px] text-[#4a4a5e]">
                      <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                      {formatTime(job.nextRunAt)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
