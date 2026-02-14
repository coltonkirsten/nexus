import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Edit3, Save, X, RefreshCw, Cog, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { Agent } from '../types/agent';
import {
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

interface SystemPromptTabProps {
  agent: Agent;
}

interface Skill {
  name: string;
  description: string;
  path: string;
}

interface SystemPromptData {
  assembled: string;
  identity: string;
  memory: string;
  skills: Skill[];
}

function CollapsibleSection({
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
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-750 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
        <Icon className="w-4 h-4 text-blue-400" />
        <span className="font-medium text-white">{title}</span>
      </button>
      {isExpanded && <div className="p-4 bg-gray-900">{children}</div>}
    </div>
  );
}

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
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);

  useEffect(() => {
    setEditedContent(content);
  }, [content]);

  const handleSave = () => {
    if (onSave) {
      onSave(editedContent);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedContent(content);
    setIsEditing(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-400">{title}</h4>
        {!readOnly && (
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleCancel}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="p-1.5 text-green-400 hover:text-green-300 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                  title="Save"
                >
                  <Save className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title="Edit"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
      {isEditing ? (
        <textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          className="w-full h-64 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 font-mono text-sm resize-y focus:outline-none focus:border-blue-500"
          spellCheck={false}
        />
      ) : (
        <pre className="w-full max-h-64 overflow-auto px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 font-mono text-sm whitespace-pre-wrap">
          {content || <span className="text-gray-500 italic">No content</span>}
        </pre>
      )}
    </div>
  );
}

function SkillCard({
  skill,
  onEdit,
  onDelete,
  isDeleting,
}: {
  skill: Skill;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-gray-800 border border-gray-700 rounded-lg group">
      <Cog className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <h4 className="font-medium text-white truncate">{skill.name}</h4>
        <p className="text-sm text-gray-400 mt-0.5">{skill.description}</p>
        <p className="text-xs text-gray-500 mt-1 font-mono truncate">{skill.path}</p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors"
          title="Edit skill"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
          title="Delete skill"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface SkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, content: string) => void;
  isSaving: boolean;
  skill?: SkillData | null;
  mode: 'create' | 'edit';
}

function SkillModal({ isOpen, onClose, onSave, isSaving, skill, mode }: SkillModalProps) {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(name, description, content);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">
            {mode === 'create' ? 'Create New Skill' : `Edit Skill: ${skill?.name}`}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {mode === 'create' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Skill Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., code-review"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Name will be sanitized (lowercase, hyphens for spaces)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Review code for best practices and bugs"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              Skill Content (Markdown)
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={mode === 'create'
                ? "# Skill Description\n\n## Instructions\n\nAdd your skill instructions here..."
                : "Edit skill content..."
              }
              className="w-full h-64 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-200 font-mono text-sm resize-y focus:outline-none focus:border-blue-500"
              spellCheck={false}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || (mode === 'create' && (!name || !description))}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {mode === 'create' ? 'Create Skill' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SystemPromptTab({ agent }: SystemPromptTabProps) {
  const queryClient = useQueryClient();

  // Modal state
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [skillModalMode, setSkillModalMode] = useState<'create' | 'edit'>('create');
  const [selectedSkill, setSelectedSkill] = useState<SkillData | null>(null);
  const [isLoadingSkill, setIsLoadingSkill] = useState(false);

  const {
    data: promptData,
    isLoading,
    error,
    refetch,
  } = useQuery<SystemPromptData>({
    queryKey: ['system-prompt', agent.id],
    queryFn: () => getSystemPrompt(agent.id),
  });

  // Separate query for skills to allow independent refetching
  const { data: skillsData } = useQuery<SkillData[]>({
    queryKey: ['skills', agent.id],
    queryFn: () => listSkills(agent.id),
  });

  const identityMutation = useMutation({
    mutationFn: (content: string) => updateIdentity(agent.id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-prompt', agent.id] });
    },
  });

  const memoryMutation = useMutation({
    mutationFn: (content: string) => updateMemory(agent.id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-prompt', agent.id] });
    },
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
      queryClient.invalidateQueries({ queryKey: ['system-prompt', agent.id] });
      setSkillModalOpen(false);
    },
  });

  const deleteSkillMutation = useMutation({
    mutationFn: (skillName: string) => deleteSkill(agent.id, skillName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills', agent.id] });
      queryClient.invalidateQueries({ queryKey: ['system-prompt', agent.id] });
    },
  });

  const handleCreateSkill = () => {
    setSelectedSkill(null);
    setSkillModalMode('create');
    setSkillModalOpen(true);
  };

  const handleEditSkill = async (skill: Skill) => {
    setIsLoadingSkill(true);
    try {
      const fullSkill = await getSkill(agent.id, skill.name);
      setSelectedSkill(fullSkill);
      setSkillModalMode('edit');
      setSkillModalOpen(true);
    } catch (err) {
      console.error('Failed to load skill:', err);
    } finally {
      setIsLoadingSkill(false);
    }
  };

  const handleDeleteSkill = (skillName: string) => {
    if (window.confirm(`Are you sure you want to delete the skill "${skillName}"?`)) {
      deleteSkillMutation.mutate(skillName);
    }
  };

  const handleSaveSkill = (name: string, description: string, content: string) => {
    if (skillModalMode === 'create') {
      createSkillMutation.mutate({ name, description, content });
    } else if (selectedSkill) {
      updateSkillMutation.mutate({ skillName: selectedSkill.name, content });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading system prompt...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-400 mb-3">Failed to load system prompt</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { assembled, identity, memory, skills } = promptData || {
    assembled: '',
    identity: '',
    memory: '',
    skills: [],
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">System Prompt Configuration</h3>
            <p className="text-sm text-gray-400 mt-1">
              View and edit the components that make up this agent's system prompt
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Assembled System Prompt (Read-only) */}
        <CollapsibleSection title="Assembled System Prompt" icon={Eye} defaultExpanded={false}>
          <div className="space-y-2">
            <p className="text-sm text-gray-400">
              This is the complete system prompt that the agent sees, assembled from all components.
            </p>
            <pre className="w-full max-h-96 overflow-auto px-4 py-3 bg-gray-950 border border-gray-700 rounded-lg text-gray-300 font-mono text-sm whitespace-pre-wrap">
              {assembled || <span className="text-gray-500 italic">No assembled prompt available</span>}
            </pre>
          </div>
        </CollapsibleSection>

        {/* Identity Editor */}
        <CollapsibleSection title="Identity (identity.md)" icon={Edit3}>
          <EditorPanel
            title="Agent identity and core instructions"
            content={identity}
            onSave={(content) => identityMutation.mutate(content)}
            isSaving={identityMutation.isPending}
          />
          {identityMutation.isError && (
            <p className="mt-2 text-sm text-red-400">Failed to save identity. Please try again.</p>
          )}
          {identityMutation.isSuccess && (
            <p className="mt-2 text-sm text-green-400">Identity saved successfully.</p>
          )}
        </CollapsibleSection>

        {/* Memory Index Editor */}
        <CollapsibleSection title="Memory Index (memory/index.md)" icon={Edit3}>
          <EditorPanel
            title="Memory index and context"
            content={memory}
            onSave={(content) => memoryMutation.mutate(content)}
            isSaving={memoryMutation.isPending}
          />
          {memoryMutation.isError && (
            <p className="mt-2 text-sm text-red-400">Failed to save memory. Please try again.</p>
          )}
          {memoryMutation.isSuccess && (
            <p className="mt-2 text-sm text-green-400">Memory saved successfully.</p>
          )}
        </CollapsibleSection>

        {/* Skills Panel */}
        <CollapsibleSection title="Available Skills" icon={Cog}>
          <div className="space-y-4 relative">
            {isLoadingSkill && (
              <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center z-10 rounded-lg">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">
                Skills available to this agent from the ledger
              </p>
              <button
                onClick={handleCreateSkill}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Skill
              </button>
            </div>
            {(skillsData || skills).length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No skills configured for this agent
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(skillsData || skills).map((skill) => (
                  <SkillCard
                    key={skill.path}
                    skill={skill}
                    onEdit={() => handleEditSkill(skill)}
                    onDelete={() => handleDeleteSkill(skill.name)}
                    isDeleting={deleteSkillMutation.isPending}
                  />
                ))}
              </div>
            )}
            {createSkillMutation.isError && (
              <p className="text-sm text-red-400">Failed to create skill. Please try again.</p>
            )}
            {deleteSkillMutation.isError && (
              <p className="text-sm text-red-400">Failed to delete skill. Please try again.</p>
            )}
          </div>
        </CollapsibleSection>
      </div>

      {/* Skill Modal */}
      <SkillModal
        isOpen={skillModalOpen}
        onClose={() => setSkillModalOpen(false)}
        onSave={handleSaveSkill}
        isSaving={createSkillMutation.isPending || updateSkillMutation.isPending}
        skill={selectedSkill}
        mode={skillModalMode}
      />
    </div>
  );
}
