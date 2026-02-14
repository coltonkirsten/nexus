import { useState } from 'react';
import { Plus, Circle, Bot } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { Agent } from '../types/agent';
import { listAgents } from '../api/agents';
import { CreateAgentModal } from './CreateAgentModal';

interface AgentListProps {
  selectedAgentId: string | null;
  onSelectAgent: (agent: Agent) => void;
}

function AgentListItem({
  agent,
  isSelected,
  onClick,
}: {
  agent: Agent;
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusColors: Record<string, string> = {
    idle: 'text-green-500',
    running: 'text-green-500',
    processing: 'text-yellow-500',
    starting: 'text-yellow-500',
    stopping: 'text-yellow-500',
    stopped: 'text-red-500',
    error: 'text-red-500',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
        isSelected
          ? 'bg-gray-700 text-white'
          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <Bot className="w-5 h-5 text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{agent.name}</p>
        <p className="text-xs text-gray-500 truncate">
          {agent.lastActivity
            ? `Last active: ${new Date(agent.lastActivity).toLocaleString()}`
            : 'No activity'}
        </p>
      </div>
      <Circle className={`w-2.5 h-2.5 fill-current shrink-0 ${statusColors[agent.status] || 'text-gray-500'}`} />
    </button>
  );
}

export function AgentList({ selectedAgentId, onSelectAgent }: AgentListProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    data: agents = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['agents'],
    queryFn: listAgents,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Agents</h2>
          <button
            onClick={() => setIsModalOpen(true)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            title="Create new agent"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              Loading agents...
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center h-32 text-red-400">
              Failed to load agents
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-center px-4">
              <Bot className="w-8 h-8 mb-2 opacity-50" />
              <p>No agents yet</p>
              <p className="text-sm">Create one to get started</p>
            </div>
          ) : (
            <div className="space-y-1">
              {agents.map((agent) => (
                <AgentListItem
                  key={agent.id}
                  agent={agent}
                  isSelected={agent.id === selectedAgentId}
                  onClick={() => onSelectAgent(agent)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateAgentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
