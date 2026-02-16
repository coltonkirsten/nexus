import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Save,
  RefreshCw,
  AlertCircle,
  Check,
  X,
  GitCompare,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { Agent } from '../types/agent';
import { getLedgerTree, getLedgerFile, saveLedgerFile, type FileEntry } from '../api/agents';
import { ConfirmModal } from './ConfirmModal';

interface LedgerTabProps {
  agent: Agent;
}

interface LedgerTree {
  entries: FileEntry[];
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber: number;
}

// Compute simple line-by-line diff
function computeDiff(original: string, modified: string): DiffLine[] {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const diff: DiffLine[] = [];

  const maxLen = Math.max(originalLines.length, modifiedLines.length);

  for (let i = 0; i < maxLen; i++) {
    const origLine = originalLines[i];
    const modLine = modifiedLines[i];

    if (origLine === undefined && modLine !== undefined) {
      diff.push({ type: 'added', content: modLine, lineNumber: i + 1 });
    } else if (origLine !== undefined && modLine === undefined) {
      diff.push({ type: 'removed', content: origLine, lineNumber: i + 1 });
    } else if (origLine !== modLine) {
      diff.push({ type: 'removed', content: origLine, lineNumber: i + 1 });
      diff.push({ type: 'added', content: modLine, lineNumber: i + 1 });
    } else {
      diff.push({ type: 'unchanged', content: origLine, lineNumber: i + 1 });
    }
  }

  return diff;
}

function TreeNode({
  entry,
  depth,
  selectedPath,
  onSelect,
  expandedPaths,
  onToggleExpand,
}: {
  entry: FileEntry;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
}) {
  const isSelected = selectedPath === entry.path;
  const isExpanded = expandedPaths.has(entry.path);
  const isDirectory = entry.type === 'directory';

  const handleClick = () => {
    if (isDirectory) {
      onToggleExpand(entry.path);
    } else {
      onSelect(entry.path);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left transition-all duration-200 rounded-lg ${
          isSelected
            ? 'bg-indigo-500/20 text-indigo-300'
            : 'text-[#e0e0e8] hover:bg-[#1a1a2e]'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-[#4a4a5e] shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#4a4a5e] shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <FileText className="w-4 h-4 text-[#7a7a8e] shrink-0" />
          </>
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {isDirectory && isExpanded && entry.children && (
        <div>
          {entry.children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DiffView({
  original,
  modified,
  title = 'Changes Detected',
}: {
  original: string;
  modified: string;
  title?: string;
}) {
  const diffLines = computeDiff(original, modified);
  const hasChanges = diffLines.some((line) => line.type !== 'unchanged');

  if (!hasChanges) {
    return (
      <div className="border-t border-[#1e1e3a] bg-[#0a0a0f]">
        <div className="px-4 py-3 text-sm text-[#4a4a5e] text-center">
          No changes detected
        </div>
      </div>
    );
  }

  const linesToShow = diffLines.filter((line) => line.type !== 'unchanged');

  return (
    <div className="border-t border-[#1e1e3a] bg-[#0a0a0f]">
      <div className="px-4 py-2 text-sm font-medium text-[#7a7a8e] border-b border-[#1e1e3a] flex items-center gap-2">
        <GitCompare className="w-4 h-4" />
        {title}
        <span className="text-xs text-[#4a4a5e]">
          ({diffLines.filter(l => l.type === 'added').length} additions, {diffLines.filter(l => l.type === 'removed').length} deletions)
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto font-mono text-xs">
        {linesToShow.map((line, index) => (
          <div
            key={index}
            className={`px-4 py-0.5 ${
              line.type === 'added'
                ? 'bg-green-900/30 text-green-400'
                : line.type === 'removed'
                ? 'bg-red-900/30 text-red-400'
                : 'text-[#4a4a5e]'
            }`}
          >
            <span className="inline-block w-8 text-[#4a4a5e] select-none">{line.lineNumber}</span>
            <span className="inline-block w-4 mr-1 select-none">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            {line.content}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LedgerTab({ agent }: LedgerTabProps) {
  const [tree, setTree] = useState<LedgerTree | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string>('');
  const [editorContent, setEditorContent] = useState<string>('');
  const [previousContent, setPreviousContent] = useState<string>('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(['/ledger', '/ledger/memory', '/ledger/skills'])
  );
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showDiff, setShowDiff] = useState(false);
  const [diffMode, setDiffMode] = useState<'local' | 'external'>('local');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [externalChangesDetected, setExternalChangesDetected] = useState(false);
  const [confirmSwitchPath, setConfirmSwitchPath] = useState<string | null>(null);

  const hasChanges = originalContent !== editorContent;

  // Fetch ledger tree
  const fetchTree = useCallback(async () => {
    setIsLoadingTree(true);
    setError(null);
    try {
      const data = await getLedgerTree(agent.id);
      setTree(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger');
    } finally {
      setIsLoadingTree(false);
    }
  }, [agent.id]);

  // Fetch file content
  const fetchFile = useCallback(
    async (path: string, isRefresh = false) => {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoadingFile(true);
      }
      setError(null);
      try {
        const data = await getLedgerFile(agent.id, path);
        const content = data.content || '';

        if (isRefresh) {
          if (content !== originalContent) {
            setExternalChangesDetected(true);
            setShowDiff(true);
            setDiffMode('external');
          }
          setOriginalContent(content);
          if (!hasChanges) {
            setEditorContent(content);
          }
        } else {
          setPreviousContent(content);
          setOriginalContent(content);
          setEditorContent(content);
          setExternalChangesDetected(false);
          setShowDiff(false);
        }
        setSaveStatus('idle');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file');
      } finally {
        setIsLoadingFile(false);
        setIsRefreshing(false);
      }
    },
    [agent.id, originalContent, hasChanges]
  );

  // Refresh file to detect external changes
  const refreshAndShowDiff = useCallback(() => {
    if (selectedPath) {
      fetchFile(selectedPath, true);
    }
  }, [selectedPath, fetchFile]);

  // Save file
  const saveFile = async () => {
    if (!selectedPath || !hasChanges) return;

    setIsSaving(true);
    setError(null);
    setSaveStatus('idle');
    try {
      await saveLedgerFile(agent.id, selectedPath, editorContent);
      setOriginalContent(editorContent);
      setPreviousContent(editorContent);
      setExternalChangesDetected(false);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  // Discard changes
  const discardChanges = () => {
    setEditorContent(originalContent);
    setSaveStatus('idle');
    if (diffMode === 'local') {
      setShowDiff(false);
    }
  };

  // Toggle diff view
  const toggleDiff = () => {
    setShowDiff((prev) => !prev);
    if (!showDiff) {
      setDiffMode(hasChanges ? 'local' : 'external');
    }
  };

  // Toggle directory expansion
  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Select file
  const handleSelectFile = (path: string) => {
    if (hasChanges) {
      setConfirmSwitchPath(path);
      return;
    }
    doSelectFile(path);
  };

  const doSelectFile = (path: string) => {
    setSelectedPath(path);
    setShowDiff(false);
    setExternalChangesDetected(false);
    fetchFile(path);
  };

  // Load tree on mount
  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  return (
    <div className="flex h-full">
      {/* File tree sidebar */}
      <div className="w-64 border-r border-[#1e1e3a] flex flex-col bg-[#0a0a0f]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e3a]">
          <span className="text-sm font-medium text-[#e0e0e8]">Ledger Files</span>
          <button
            onClick={fetchTree}
            disabled={isLoadingTree}
            className="p-1 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingTree ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-1">
          {isLoadingTree ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 text-[#4a4a5e] animate-spin" />
            </div>
          ) : tree ? (
            tree.entries.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                selectedPath={selectedPath}
                onSelect={handleSelectFile}
                expandedPaths={expandedPaths}
                onToggleExpand={toggleExpand}
              />
            ))
          ) : (
            <div className="px-4 py-8 text-center text-[#4a4a5e] text-sm">
              No ledger found
            </div>
          )}
        </div>
      </div>

      {/* Editor panel */}
      <div className="flex-1 flex flex-col">
        {/* Editor header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e3a]">
          <div className="flex items-center gap-2">
            {selectedPath ? (
              <>
                <FileText className="w-4 h-4 text-[#7a7a8e]" />
                <span className="text-sm text-[#e0e0e8] font-mono">{selectedPath}</span>
                {hasChanges && (
                  <span className="px-1.5 py-0.5 text-xs bg-yellow-600/30 text-yellow-400 rounded-lg">
                    Modified
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-[#4a4a5e]">Select a file to edit</span>
            )}
          </div>

          {selectedPath && (
            <div className="flex items-center gap-2">
              {saveStatus === 'success' && (
                <span className="flex items-center gap-1 text-sm text-emerald-400">
                  <Check className="w-4 h-4" />
                  Saved
                </span>
              )}
              {externalChangesDetected && (
                <span className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600/30 text-purple-400 rounded-lg">
                  External changes
                </span>
              )}
              <button
                onClick={refreshAndShowDiff}
                disabled={isRefreshing}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200 disabled:opacity-50"
                title="Refresh file to detect agent changes"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={toggleDiff}
                disabled={!hasChanges && !externalChangesDetected}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-xl transition-all duration-200 ${
                  showDiff
                    ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
                    : 'text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e]'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Toggle diff view"
              >
                {showDiff ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showDiff ? 'Hide Diff' : 'Show Diff'}
              </button>
              {hasChanges && (
                <button
                  onClick={discardChanges}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200"
                >
                  <X className="w-4 h-4" />
                  Discard
                </button>
              )}
              <button
                onClick={saveFile}
                disabled={!hasChanges || isSaving}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-900/30 text-red-400 text-sm border-b border-[#1e1e3a]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Editor content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedPath ? (
            isLoadingFile ? (
              <div className="flex-1 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-[#4a4a5e] animate-spin" />
              </div>
            ) : (
              <>
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  className="flex-1 w-full p-4 bg-[#0a0a0f] text-[#e0e0e8] font-mono text-sm resize-none focus:outline-none"
                  spellCheck={false}
                  placeholder="File content..."
                />
                {showDiff && (
                  <div className="border-t border-[#1e1e3a]">
                    {(hasChanges || externalChangesDetected) && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-[#12121a] border-b border-[#1e1e3a]">
                        <span className="text-xs text-[#4a4a5e] mr-2">View:</span>
                        <button
                          onClick={() => setDiffMode('local')}
                          disabled={!hasChanges}
                          className={`px-2 py-1 text-xs rounded-lg transition-all duration-200 ${
                            diffMode === 'local'
                              ? 'bg-indigo-500/20 text-indigo-400'
                              : 'text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e]'
                          } disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          Local Changes
                        </button>
                        <button
                          onClick={() => setDiffMode('external')}
                          disabled={!externalChangesDetected}
                          className={`px-2 py-1 text-xs rounded-lg transition-all duration-200 ${
                            diffMode === 'external'
                              ? 'bg-purple-600/30 text-purple-400'
                              : 'text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e]'
                          } disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          External Changes (Agent)
                        </button>
                      </div>
                    )}
                    {diffMode === 'local' && hasChanges ? (
                      <DiffView
                        original={originalContent}
                        modified={editorContent}
                        title="Local Changes (Your Edits)"
                      />
                    ) : diffMode === 'external' && externalChangesDetected ? (
                      <DiffView
                        original={previousContent}
                        modified={originalContent}
                        title="External Changes (Agent Activity)"
                      />
                    ) : (
                      <div className="px-4 py-3 text-sm text-[#4a4a5e] text-center">
                        No changes to display. Click &quot;Refresh&quot; to check for external changes.
                      </div>
                    )}
                  </div>
                )}
              </>
            )
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#4a4a5e]">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select a file from the ledger tree to view and edit</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm unsaved changes */}
      <ConfirmModal
        isOpen={!!confirmSwitchPath}
        onClose={() => setConfirmSwitchPath(null)}
        onConfirm={() => {
          if (confirmSwitchPath) {
            doSelectFile(confirmSwitchPath);
          }
          setConfirmSwitchPath(null);
        }}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to switch files? Your changes will be lost."
        confirmLabel="Switch File"
        variant="warning"
      />
    </div>
  );
}

export default LedgerTab;
