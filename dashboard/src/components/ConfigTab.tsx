import { useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import type { Agent, AgentConfig } from '../types/agent';
import { updateAgentConfig } from '../api/agents';

interface ConfigTabProps {
  agent: Agent;
}

const MODEL_OPTIONS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
];

const TOOL_OPTIONS = [
  { value: 'Bash', label: 'Bash' },
  { value: 'Read', label: 'Read' },
  { value: 'Write', label: 'Write' },
  { value: 'Edit', label: 'Edit' },
  { value: 'Glob', label: 'Glob' },
  { value: 'Grep', label: 'Grep' },
];

const DEFAULT_CONFIG: AgentConfig = {
  model: 'claude-sonnet-4-5-20250929',
  maxTurns: 50,
  timeout: 300,
  allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
};

export function ConfigTab({ agent }: ConfigTabProps) {
  const [config, setConfig] = useState<AgentConfig>(() => ({
    ...DEFAULT_CONFIG,
    ...(agent.config || {}),
  }));
  const [saveSuccess, setSaveSuccess] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (newConfig: AgentConfig) => updateAgentConfig(agent.id, newConfig),
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setConfig((prev) => ({ ...prev, model: e.target.value }));
  };

  const handleMaxTurnsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1) {
      setConfig((prev) => ({ ...prev, maxTurns: value }));
    }
  };

  const handleTimeoutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1) {
      setConfig((prev) => ({ ...prev, timeout: value }));
    }
  };

  const handleToolToggle = (tool: string) => {
    setConfig((prev) => {
      const isEnabled = prev.allowedTools.includes(tool);
      return {
        ...prev,
        allowedTools: isEnabled
          ? prev.allowedTools.filter((t) => t !== tool)
          : [...prev.allowedTools, tool],
      };
    });
  };

  const handleSave = () => {
    updateMutation.mutate(config);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h3 className="text-lg font-medium text-white">Agent Configuration</h3>
        <div className="flex items-center gap-3">
          {saveSuccess && (
            <span className="text-sm text-green-400">Configuration saved!</span>
          )}
          {updateMutation.isError && (
            <span className="text-sm text-red-400">Failed to save</span>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* Model Selection */}
          <div>
            <label
              htmlFor="model"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Model
            </label>
            <select
              id="model"
              value={config.model}
              onChange={handleModelChange}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-500">
              Select the Claude model to use for this agent
            </p>
          </div>

          {/* Max Turns */}
          <div>
            <label
              htmlFor="maxTurns"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Max Turns
            </label>
            <input
              id="maxTurns"
              type="number"
              min="1"
              max="500"
              value={config.maxTurns}
              onChange={handleMaxTurnsChange}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Maximum number of conversation turns before stopping (1-500)
            </p>
          </div>

          {/* Timeout */}
          <div>
            <label
              htmlFor="timeout"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Timeout (seconds)
            </label>
            <input
              id="timeout"
              type="number"
              min="1"
              max="3600"
              value={config.timeout}
              onChange={handleTimeoutChange}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Maximum time in seconds for agent execution (1-3600)
            </p>
          </div>

          {/* Allowed Tools */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Allowed Tools
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {TOOL_OPTIONS.map((tool) => {
                const isChecked = config.allowedTools.includes(tool.value);
                return (
                  <label
                    key={tool.value}
                    className={`flex items-center gap-3 px-4 py-3 bg-gray-800 border rounded-lg cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToolToggle(tool.value)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    <span className="text-sm text-gray-300">{tool.label}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Select which tools the agent is allowed to use
            </p>
          </div>
        </div>
      </div>

      {/* Footer with Save Button */}
      <div className="px-6 py-4 border-t border-gray-700 bg-gray-900/50">
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Configuration
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
