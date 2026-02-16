import { useState } from 'react';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createAgent } from '../api/agents';

interface CreateAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const templates = [
  { id: 'blank', name: 'Blank Agent', description: 'Start with a clean slate' },
  { id: 'coder', name: 'Coder', description: 'Software development and programming tasks' },
  { id: 'researcher', name: 'Researcher', description: 'Research, analysis, and information gathering' },
  { id: 'writer', name: 'Writer', description: 'Content creation, writing, and editing' },
];

export function CreateAgentModal({ isOpen, onClose }: CreateAgentModalProps) {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('blank');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setName('');
      setTemplate('blank');
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      createMutation.mutate({
        name: name.trim(),
        template,
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-[#12121a] rounded-2xl shadow-2xl border border-[#1e1e3a]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e3a]">
          <h3 className="text-sm font-semibold text-[#e0e0e8]">Create New Agent</h3>
          <button
            onClick={onClose}
            className="p-1 text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Name input */}
          <div className="mb-4">
            <label
              htmlFor="agent-name"
              className="block text-xs text-[#7a7a8e] mb-1.5"
            >
              Agent Name
            </label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter agent name..."
              className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] placeholder-[#4a4a5e] text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all duration-200"
              autoFocus
            />
          </div>

          {/* Template dropdown */}
          <div className="mb-6">
            <label
              htmlFor="agent-template"
              className="block text-xs text-[#7a7a8e] mb-1.5"
            >
              Template
            </label>
            <select
              id="agent-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] text-sm focus:outline-none focus:border-indigo-500 transition-all duration-200 appearance-none cursor-pointer"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[10px] text-[#4a4a5e]">
              {templates.find((t) => t.id === template)?.description}
            </p>
          </div>

          {/* Error message */}
          {createMutation.isError && (
            <p className="mb-4 text-xs text-red-400">
              Failed to create agent. Please try again.
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl text-sm transition-all duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createMutation.isPending}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
