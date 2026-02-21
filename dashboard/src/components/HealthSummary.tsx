import { Activity, AlertTriangle, CheckCircle, XCircle, Clock, RotateCw } from 'lucide-react';
import type { Agent } from '../types/agent';

interface HealthSummaryProps {
  agents: Agent[];
}

function formatUptime(startedAt?: string): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = now - start;

  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function isRecentCrash(agent: Agent): boolean {
  // Check if the agent has error status or health failures within the last hour
  if (agent.status === 'error') return true;
  if ((agent.healthFailures ?? 0) > 0) return true;
  if ((agent.restartCount ?? 0) > 0) return true;
  return false;
}

export function HealthSummary({ agents }: HealthSummaryProps) {
  const totalAgents = agents.length;
  const runningAgents = agents.filter(a => a.status === 'running');
  const runningCount = runningAgents.length;
  const stoppedCount = agents.filter(a => a.status === 'stopped' || a.status === 'created').length;
  const errorCount = agents.filter(a => a.status === 'error').length;
  const agentsWithRestarts = agents.filter(a => (a.restartCount ?? 0) > 0 || (a.healthFailures ?? 0) > 0);
  const recentCrashes = agents.filter(isRecentCrash);

  // Don't show if no agents
  if (totalAgents === 0) return null;

  return (
    <div className="mb-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            <span className="text-xs text-[#7a7a8e]">Total Agents</span>
          </div>
          <p className="text-2xl font-bold text-[#e0e0e8]">{totalAgents}</p>
        </div>

        <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-[#7a7a8e]">Running</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">{runningCount}</p>
        </div>

        <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-[#4a4a5e]" />
            <span className="text-xs text-[#7a7a8e]">Stopped</span>
          </div>
          <p className="text-2xl font-bold text-[#7a7a8e]">{stoppedCount}</p>
        </div>

        <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-[#7a7a8e]">Errors</span>
          </div>
          <p className={`text-2xl font-bold ${errorCount > 0 ? 'text-red-400' : 'text-[#7a7a8e]'}`}>
            {errorCount}
          </p>
        </div>
      </div>

      {/* Running Agents with Uptime */}
      {runningAgents.length > 0 && (
        <div className="bg-[#12121a] border border-[#1e1e3a] rounded-xl p-4 mb-4">
          <h3 className="text-xs font-medium text-[#e0e0e8] mb-3 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            Running Agents - Uptime
          </h3>
          <div className="flex flex-wrap gap-3">
            {runningAgents.map(agent => (
              <div
                key={agent.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#0a0a0f] rounded-lg border border-[#1e1e3a]"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-[#e0e0e8]">{agent.name}</span>
                <span className="text-[10px] text-[#4a4a5e] font-mono">
                  {formatUptime(agent.startedAt || agent.lastActivity)}
                </span>
                {(agent.restartCount ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400" title={`Restarted ${agent.restartCount} time(s)`}>
                    <RotateCw className="w-2.5 h-2.5" />
                    {agent.restartCount}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warning: Agents with Issues */}
      {(agentsWithRestarts.length > 0 || recentCrashes.length > 0) && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
          <h3 className="text-xs font-medium text-amber-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            Agents Requiring Attention
          </h3>
          <div className="space-y-2">
            {agents.filter(a => isRecentCrash(a)).map(agent => (
              <div
                key={agent.id}
                className="flex items-center justify-between px-3 py-2 bg-[#0a0a0f] rounded-lg border border-[#1e1e3a]"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    agent.status === 'error' ? 'bg-red-400' :
                    agent.status === 'running' ? 'bg-amber-400' : 'bg-[#4a4a5e]'
                  }`} />
                  <span className="text-xs text-[#e0e0e8]">{agent.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  {agent.status === 'error' && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400">
                      Error State
                    </span>
                  )}
                  {(agent.healthFailures ?? 0) > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">
                      {agent.healthFailures} health check failure(s)
                    </span>
                  )}
                  {(agent.restartCount ?? 0) > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 flex items-center gap-1">
                      <RotateCw className="w-2.5 h-2.5" />
                      {agent.restartCount} restart(s)
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
