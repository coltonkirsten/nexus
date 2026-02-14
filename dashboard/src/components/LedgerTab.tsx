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

interface LedgerTabProps {
  agent: Agent;
}

interface LedgerEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: LedgerEntry[];
}

interface LedgerTree {
  entries: LedgerEntry[];
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber: number;
}

const API_BASE = 'http://localhost:3001';

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
  entry: LedgerEntry;
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
        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left transition-colors rounded ${
          isSelected
            ? 'bg-blue-600/30 text-blue-300'
            : 'text-gray-300 hover:bg-gray-700/50'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-yellow-500 shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-yellow-500 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
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
  showAllLines = false,
}: {
  original: string;
  modified: string;
  title?: string;
  showAllLines?: boolean;
}) {
  const diffLines = computeDiff(original, modified);
  const hasChanges = diffLines.some((line) => line.type !== 'unchanged');

  if (!hasChanges) {
    return (
      <div className="border-t border-gray-700 bg-gray-900">
        <div className="px-4 py-3 text-sm text-gray-500 text-center">
          No changes detected
        </div>
      </div>
    );
  }

  const linesToShow = showAllLines
    ? diffLines
    : diffLines.filter((line) => line.type !== 'unchanged');

  return (
    <div className="border-t border-gray-700 bg-gray-900">
      <div className="px-4 py-2 text-sm font-medium text-gray-400 border-b border-gray-700 flex items-center gap-2">
        <GitCompare className="w-4 h-4" />
        {title}
        <span className="text-xs text-gray-500">
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
                : 'text-gray-500'
            }`}
          >
            <span className="inline-block w-8 text-gray-600 select-none">{line.lineNumber}</span>
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
  const [previousContent, setPreviousContent] = useState<string>(''); // Content when file was first loaded
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

  const hasChanges = originalContent !== editorContent;

  // Fetch ledger tree
  const fetchTree = useCallback(async () => {
    setIsLoadingTree(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/agents/${agent.id}/ledger`);
      if (!response.ok) {
        throw new Error('Failed to fetch ledger tree');
      }
      const data: LedgerTree = await response.json();
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
        const response = await fetch(
          `${API_BASE}/api/agents/${agent.id}/ledger/file?path=${encodeURIComponent(path)}`
        );
        if (!response.ok) {
          throw new Error('Failed to fetch file');
        }
        const data = await response.json();
        const content = data.content || '';

        if (isRefresh) {
          // On refresh, check for external changes (agent activity)
          if (content !== originalContent) {
            setExternalChangesDetected(true);
            setShowDiff(true);
            setDiffMode('external');
          }
          // Update original content to the new fetched content
          setOriginalContent(content);
          // If no local edits, also update editor content
          if (!hasChanges) {
            setEditorContent(content);
          }
        } else {
          // Initial load - store as both previous and original
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
      const response = await fetch(
        `${API_BASE}/api/agents/${agent.id}/ledger/file?path=${encodeURIComponent(selectedPath)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: editorContent }),
        }
      );
      if (!response.ok) {
        throw new Error('Failed to save file');
      }
      // After saving, update both original and previous to the saved content
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
      // Default to showing local changes if any, otherwise external
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
      // Could add a confirmation dialog here
      const confirm = window.confirm(
        'You have unsaved changes. Are you sure you want to switch files?'
      );
      if (!confirm) return;
    }
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
      <div className="w-64 border-r border-gray-700 flex flex-col bg-gray-900/50">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="text-sm font-medium text-gray-300">Ledger Files</span>
          <button
            onClick={fetchTree}
            disabled={isLoadingTree}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingTree ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {isLoadingTree ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 text-gray-500 animate-spin" />
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
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              No ledger found
            </div>
          )}
        </div>
      </div>

      {/* Editor panel */}
      <div className="flex-1 flex flex-col">
        {/* Editor header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            {selectedPath ? (
              <>
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-300 font-mono">{selectedPath}</span>
                {hasChanges && (
                  <span className="px-1.5 py-0.5 text-xs bg-yellow-600/30 text-yellow-400 rounded">
                    Modified
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-gray-500">Select a file to edit</span>
            )}
          </div>

          {selectedPath && (
            <div className="flex items-center gap-2">
              {saveStatus === 'success' && (
                <span className="flex items-center gap-1 text-sm text-green-400">
                  <Check className="w-4 h-4" />
                  Saved
                </span>
              )}
              {externalChangesDetected && (
                <span className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600/30 text-purple-400 rounded">
                  External changes
                </span>
              )}
              {/* Refresh & Show Diff button */}
              <button
                onClick={refreshAndShowDiff}
                disabled={isRefreshing}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                title="Refresh file to detect agent changes"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              {/* Show Diff toggle */}
              <button
                onClick={toggleDiff}
                disabled={!hasChanges && !externalChangesDetected}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors ${
                  showDiff
                    ? 'bg-purple-600/30 text-purple-400 hover:bg-purple-600/40'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Toggle diff view"
              >
                {showDiff ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showDiff ? 'Hide Diff' : 'Show Diff'}
              </button>
              {hasChanges && (
                <button
                  onClick={discardChanges}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                  Discard
                </button>
              )}
              <button
                onClick={saveFile}
                disabled={!hasChanges || isSaving}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-900/30 text-red-400 text-sm border-b border-gray-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Editor content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedPath ? (
            isLoadingFile ? (
              <div className="flex-1 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-gray-500 animate-spin" />
              </div>
            ) : (
              <>
                <textarea
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  className="flex-1 w-full p-4 bg-gray-950 text-gray-200 font-mono text-sm resize-none focus:outline-none"
                  spellCheck={false}
                  placeholder="File content..."
                />
                {showDiff && (
                  <div className="border-t border-gray-700">
                    {/* Diff mode selector */}
                    {(hasChanges || externalChangesDetected) && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
                        <span className="text-xs text-gray-500 mr-2">View:</span>
                        <button
                          onClick={() => setDiffMode('local')}
                          disabled={!hasChanges}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            diffMode === 'local'
                              ? 'bg-blue-600/30 text-blue-400'
                              : 'text-gray-400 hover:text-white hover:bg-gray-700'
                          } disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          Local Changes
                        </button>
                        <button
                          onClick={() => setDiffMode('external')}
                          disabled={!externalChangesDetected}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            diffMode === 'external'
                              ? 'bg-purple-600/30 text-purple-400'
                              : 'text-gray-400 hover:text-white hover:bg-gray-700'
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
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">
                        No changes to display. Click "Refresh" to check for external changes.
                      </div>
                    )}
                  </div>
                )}
              </>
            )
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select a file from the ledger tree to view and edit</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LedgerTab;
