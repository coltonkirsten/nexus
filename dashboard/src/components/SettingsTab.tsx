import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Save,
  Loader2,
  Eye,
  Edit3,
  X,
  Cog,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  HardDrive,
} from 'lucide-react';
import type { Agent, AgentConfig } from '../types/agent';
import {
  updateAgentConfig,
  getSystemPrompt,
  updateIdentity,
  updateMemory,
  listSkills,
  getSkill,
  createSkill,
  updateSkill as updateSkillApi,
  deleteSkill,
  type SkillData,
} from '../api/agents';
import { ConfirmModal } from './ConfirmModal';
import { VolumeSlots } from './VolumeSlots';

interface SettingsTabProps {
  agent: Agent;
}

const MODEL_OPTIONS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
];

const TOOL_OPTIONS = [
  { value: 'Bash', label: 'Bash' },
  { value: 'Read', label: 'Read' },
  { value: 'Write', label: 'Write' },
  { value: 'Edit', label: 'Edit' },
  { value: 'Glob', label: 'Glob' },
  { value: 'Grep', label: 'Grep' },
];

const DEFAULT_CONFIG: Required<AgentConfig> = {
  model: 'claude-sonnet-4-5-20250929',
  maxTurns: 50,
  timeout: 300,
  allowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
};

// Collapsible section wrapper
function Section({
  title,
  icon: Icon,
  children,
  defaultExpanded = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-[#1e1e3a] rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-6 py-4 bg-[#12121a] hover:bg-[#1a1a2e]/50 transition-all duration-200 text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-[#4a4a5e]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[#4a4a5e]" />
        )}
        <Icon className="w-4 h-4 text-indigo-400" />
        <span className="text-sm font-semibold text-[#e0e0e8]">{title}</span>
      </button>
      {expanded && <div className="p-6 bg-[#0a0a0f]">{children}</div>}
    </div>
  );
}

// Inline editor
function EditorPanel({
  title,
  content,
  onSave,
  isSaving,
  readOnly = false,
}: {
  title: string;
  content: string;
  onSave?: (content: string) => void;
  isSaving?: boolean;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);

  useEffect(() => {
    setEditedContent(content);
  }, [content]);

  const handleSave = () => {
    onSave?.(editedContent);
    setEditing(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#7a7a8e]">{title}</span>
        {!readOnly && (
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <button
                  onClick={() => { setEditedContent(content); setEditing(false); }}
                  className="p-1.5 text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all duration-200 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="p-1.5 text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      {editing ? (
        <textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          className="w-full h-64 px-4 py-3 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] font-mono text-sm resize-y focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
          spellCheck={false}
        />
      ) : (
        <pre className="w-full max-h-64 overflow-auto px-4 py-3 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#7a7a8e] font-mono text-sm whitespace-pre-wrap">
          {content || <span className="text-[#4a4a5e] italic">No content</span>}
        </pre>
      )}
    </div>
  );
}

// Skill modal
function SkillModal({
  isOpen,
  onClose,
  onSave,
  isSaving,
  skill,
  mode,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, content: string) => void;
  isSaving: boolean;
  skill?: SkillData | null;
  mode: 'create' | 'edit';
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (skill && mode === 'edit') {
      setName(skill.name);
      setDescription(skill.description);
      setContent(skill.content || '');
    } else {
      setName('');
      setDescription('');
      setContent('');
    }
  }, [skill, mode, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#12121a] border border-[#1e1e3a] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e3a]">
          <h3 className="text-sm font-semibold text-[#e0e0e8]">
            {mode === 'create' ? 'Create New Skill' : `Edit: ${skill?.name}`}
          </h3>
          <button onClick={onClose} className="p-1 text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); onSave(name, description, content); }}
          className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]"
        >
          {mode === 'create' && (
            <>
              <div>
                <label className="block text-xs text-[#7a7a8e] mb-1.5">Skill Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., code-review"
                  className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] placeholder-[#4a4a5e] text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#7a7a8e] mb-1.5">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Review code for best practices"
                  className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] placeholder-[#4a4a5e] text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs text-[#7a7a8e] mb-1.5">Content (Markdown)</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Skill\n\nInstructions..."
              className="w-full h-64 px-4 py-3 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] font-mono text-sm resize-y focus:outline-none focus:border-indigo-500"
              spellCheck={false}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-[#1e1e3a]">
            <button type="button" onClick={onClose} className="px-4 py-2 text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl text-sm transition-all duration-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || (mode === 'create' && (!name || !description))}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SettingsTab({ agent }: SettingsTabProps) {
  const queryClient = useQueryClient();

  // Config state
  const [config, setConfig] = useState<Required<AgentConfig>>(() => ({
    ...DEFAULT_CONFIG,
    ...(agent.config || {}),
  }));
  const [configSaved, setConfigSaved] = useState(false);

  useEffect(() => {
    setConfig({
      ...DEFAULT_CONFIG,
      ...(agent.config || {}),
    });
  }, [agent.config]);

  // Skill modal state
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [skillModalMode, setSkillModalMode] = useState<'create' | 'edit'>('create');
  const [selectedSkill, setSelectedSkill] = useState<SkillData | null>(null);
  const [isLoadingSkill, setIsLoadingSkill] = useState(false);
  const [deleteSkillName, setDeleteSkillName] = useState<string | null>(null);

  // Queries
  const { data: promptData } = useQuery({
    queryKey: ['system-prompt', agent.id],
    queryFn: () => getSystemPrompt(agent.id),
  });

  const { data: skillsData } = useQuery({
    queryKey: ['skills', agent.id],
    queryFn: () => listSkills(agent.id),
  });

  // Mutations
  const configMutation = useMutation({
    mutationFn: (cfg: AgentConfig) => updateAgentConfig(agent.id, cfg),
    onSuccess: () => {
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    },
  });

  const identityMutation = useMutation({
    mutationFn: (content: string) => updateIdentity(agent.id, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system-prompt', agent.id] }),
  });

  const memoryMutation = useMutation({
    mutationFn: (content: string) => updateMemory(agent.id, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system-prompt', agent.id] }),
  });

  const createSkillMutation = useMutation({
    mutationFn: ({ name, description, content }: { name: string; description: string; content: string }) =>
      createSkill(agent.id, name, description, content || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills', agent.id] });
      queryClient.invalidateQueries({ queryKey: ['system-prompt', agent.id] });
      setSkillModalOpen(false);
    },
  });

  const updateSkillMutation = useMutation({
    mutationFn: ({ skillName, content }: { skillName: string; content: string }) =>
      updateSkillApi(agent.id, skillName, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills', agent.id] });
      setSkillModalOpen(false);
    },
  });

  const deleteSkillMutation = useMutation({
    mutationFn: (skillName: string) => deleteSkill(agent.id, skillName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills', agent.id] });
    },
  });

  const handleEditSkill = async (skill: { name: string; description: string; path: string }) => {
    setIsLoadingSkill(true);
    try {
      const full = await getSkill(agent.id, skill.name);
      setSelectedSkill(full);
      setSkillModalMode('edit');
      setSkillModalOpen(true);
    } catch {
      // ignore
    } finally {
      setIsLoadingSkill(false);
    }
  };

  const handleSaveSkill = (name: string, description: string, content: string) => {
    if (skillModalMode === 'create') {
      createSkillMutation.mutate({ name, description, content });
    } else if (selectedSkill) {
      updateSkillMutation.mutate({ skillName: selectedSkill.name, content });
    }
  };

  const skills = skillsData || promptData?.skills || [];

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0f]">
      <div className="max-w-3xl mx-auto p-8 space-y-6">
        {/* Agent Configuration */}
        <Section title="Agent Configuration" icon={Cog}>
          <div className="space-y-5">
            {/* Model */}
            <div>
              <label className="block text-xs text-[#7a7a8e] mb-1.5">Model</label>
              <select
                value={config.model}
                onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
                className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] text-sm focus:outline-none focus:border-indigo-500 transition-all duration-200"
              >
                {MODEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Max Turns */}
            <div>
              <label className="block text-xs text-[#7a7a8e] mb-1.5">Max Turns</label>
              <input
                type="number"
                min="1"
                max="500"
                value={config.maxTurns}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1) setConfig(prev => ({ ...prev, maxTurns: v }));
                }}
                className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] text-sm focus:outline-none focus:border-indigo-500 transition-all duration-200"
              />
            </div>

            {/* Timeout */}
            <div>
              <label className="block text-xs text-[#7a7a8e] mb-1.5">Timeout (seconds)</label>
              <input
                type="number"
                min="1"
                max="3600"
                value={config.timeout}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1) setConfig(prev => ({ ...prev, timeout: v }));
                }}
                className="w-full px-4 py-2.5 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#e0e0e8] text-sm focus:outline-none focus:border-indigo-500 transition-all duration-200"
              />
            </div>

            {/* Allowed Tools */}
            <div>
              <label className="block text-xs text-[#7a7a8e] mb-2">Allowed Tools</label>
              <div className="flex flex-wrap gap-2">
                {TOOL_OPTIONS.map((tool) => {
                  const checked = config.allowedTools.includes(tool.value);
                  return (
                    <button
                      key={tool.value}
                      onClick={() => setConfig(prev => ({
                        ...prev,
                        allowedTools: checked
                          ? prev.allowedTools.filter(t => t !== tool.value)
                          : [...prev.allowedTools, tool.value],
                      }))}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-all duration-200 ${
                        checked
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                          : 'border-[#1e1e3a] text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e]'
                      }`}
                    >
                      {tool.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Save */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => configMutation.mutate(config)}
                disabled={configMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 transition-all duration-200 disabled:opacity-50"
              >
                {configMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save Configuration
              </button>
              {configSaved && <span className="text-xs text-emerald-400">Saved</span>}
              {configMutation.isError && <span className="text-xs text-red-400">Failed to save</span>}
            </div>
          </div>
        </Section>

        {/* Volume Attachments */}
        <Section title="Volume Attachments" icon={HardDrive}>
          <VolumeSlots agent={agent} />
        </Section>

        {/* Identity */}
        <Section title="Identity (identity.md)" icon={Edit3}>
          <EditorPanel
            title="Agent identity and core instructions"
            content={promptData?.identity || ''}
            onSave={(content) => identityMutation.mutate(content)}
            isSaving={identityMutation.isPending}
          />
          {identityMutation.isSuccess && <p className="text-xs text-emerald-400 mt-2">Saved</p>}
          {identityMutation.isError && <p className="text-xs text-red-400 mt-2">Failed to save</p>}
        </Section>

        {/* Memory */}
        <Section title="Memory (memory/index.md)" icon={Edit3}>
          <EditorPanel
            title="Memory index and context"
            content={promptData?.memory || ''}
            onSave={(content) => memoryMutation.mutate(content)}
            isSaving={memoryMutation.isPending}
          />
          {memoryMutation.isSuccess && <p className="text-xs text-emerald-400 mt-2">Saved</p>}
          {memoryMutation.isError && <p className="text-xs text-red-400 mt-2">Failed to save</p>}
        </Section>

        {/* Skills */}
        <Section title="Skills" icon={Cog}>
          <div className="space-y-4 relative">
            {isLoadingSkill && (
              <div className="absolute inset-0 bg-[#0a0a0f]/50 flex items-center justify-center z-10 rounded-xl">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#7a7a8e]">Skills available to this agent</span>
              <button
                onClick={() => {
                  setSelectedSkill(null);
                  setSkillModalMode('create');
                  setSkillModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-xl hover:bg-indigo-500 transition-all duration-200"
              >
                <Plus className="w-3.5 h-3.5" />
                Create
              </button>
            </div>
            {skills.length === 0 ? (
              <div className="text-center py-8 text-[#4a4a5e] text-sm">No skills configured</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {skills.map((skill) => (
                  <div
                    key={skill.path}
                    className="group flex items-start gap-3 p-4 bg-[#12121a] border border-[#1e1e3a] rounded-xl"
                  >
                    <Cog className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-[#e0e0e8] truncate">{skill.name}</h4>
                      <p className="text-xs text-[#7a7a8e] mt-0.5">{skill.description}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditSkill(skill)}
                        className="p-1 text-[#4a4a5e] hover:text-indigo-400 hover:bg-[#1a1a2e] rounded-lg transition-all duration-200"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteSkillName(skill.name)}
                        className="p-1 text-[#4a4a5e] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* Assembled System Prompt */}
        <Section title="Assembled System Prompt" icon={Eye} defaultExpanded={false}>
          <pre className="w-full max-h-96 overflow-auto px-4 py-3 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl text-[#7a7a8e] font-mono text-xs whitespace-pre-wrap leading-relaxed">
            {promptData?.assembled || <span className="text-[#4a4a5e] italic">Not available — agent may not be running</span>}
          </pre>
        </Section>
      </div>

      <SkillModal
        isOpen={skillModalOpen}
        onClose={() => setSkillModalOpen(false)}
        onSave={handleSaveSkill}
        isSaving={createSkillMutation.isPending || updateSkillMutation.isPending}
        skill={selectedSkill}
        mode={skillModalMode}
      />

      <ConfirmModal
        isOpen={!!deleteSkillName}
        onClose={() => setDeleteSkillName(null)}
        onConfirm={() => {
          if (deleteSkillName) {
            deleteSkillMutation.mutate(deleteSkillName);
          }
          setDeleteSkillName(null);
        }}
        title="Delete Skill"
        message={`Are you sure you want to delete "${deleteSkillName}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
