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
  // Future templates can be added here
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
        template: template !== 'blank' ? template : undefined,
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
      <div className="relative w-full max-w-md bg-gray-800 rounded-xl shadow-2xl border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Create New Agent</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Name input */}
          <div className="mb-4">
            <label
              htmlFor="agent-name"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Agent Name
            </label>
            <input
              id="agent-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter agent name..."
              className="w-full px-4 py-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              autoFocus
            />
          </div>

          {/* Template dropdown */}
          <div className="mb-6">
            <label
              htmlFor="agent-template"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Template
            </label>
            <select
              id="agent-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-500">
              {templates.find((t) => t.id === template)?.description}
            </p>
          </div>

          {/* Error message */}
          {createMutation.isError && (
            <p className="mb-4 text-sm text-red-400">
              Failed to create agent. Please try again.
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
