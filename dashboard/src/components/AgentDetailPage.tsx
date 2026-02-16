import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { Agent } from '../types/agent';
import { listAgents } from '../api/agents';
import { AgentDetail } from './AgentDetail';

function StatusDot({ status }: { status: Agent['status'] }) {
  const colors: Record<string, string> = {
    idle: 'bg-emerald-400',
    running: 'bg-emerald-400',
    processing: 'bg-yellow-400',
    starting: 'bg-yellow-400',
    stopping: 'bg-yellow-400',
    stopped: 'bg-red-400',
    error: 'bg-red-400',
    created: 'bg-[#4a4a5e]',
  };

  const labels: Record<string, string> = {
    idle: 'Idle',
    running: 'Running',
    processing: 'Processing',
    starting: 'Starting',
    stopping: 'Stopping',
    stopped: 'Stopped',
    error: 'Error',
    created: 'Created',
  };

  const isRunning = status === 'running' || status === 'idle' || status === 'processing';

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${colors[status] || 'bg-[#4a4a5e]'} ${isRunning ? 'animate-pulse' : ''}`} />
      <span className="text-xs text-[#7a7a8e]">{labels[status] || status}</span>
    </div>
  );
}

export function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: listAgents,
    refetchInterval: 5000,
  });

  const agent = agents.find((a) => a.id === agentId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400 mx-auto mb-4" />
          <p className="text-[#4a4a5e] text-sm">Loading agent...</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#7a7a8e] text-sm mb-4">Agent not found</p>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 text-sm text-indigo-400 hover:text-indigo-300 border border-[#1e1e3a] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Overview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f]">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-3 border-b border-[#1e1e3a] shrink-0">
        <button
          onClick={() => navigate('/')}
          className="p-2 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200"
          title="Back to overview"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-base font-semibold text-[#e0e0e8] truncate">{agent.name}</h1>
          <StatusDot status={agent.status} />
        </div>
        <div className="ml-auto">
          <span className="text-[10px] text-[#4a4a5e] font-mono">{agent.id.slice(0, 8)}</span>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <AgentDetail agent={agent} />
      </div>
    </div>
  );
}
