import { useState, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Download,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import type { Agent } from '../types/agent';
import { getWorkspaceTree, getWorkspaceFile, type FileEntry } from '../api/agents';

interface WorkspaceTabProps {
  agent: Agent;
}

interface FileTree {
  entries: FileEntry[];
}

// Simple syntax highlighting based on file extension
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'bash',
    bash: 'bash',
  };
  return languageMap[ext] || 'plaintext';
}

// Basic syntax highlighting colors
function highlightSyntax(content: string, language: string): React.ReactNode[] {
  const lines = content.split('\n');

  return lines.map((line, index) => {
    let highlightedLine: React.ReactNode = line;

    if (language === 'python') {
      highlightedLine = highlightPython(line);
    } else if (language === 'typescript' || language === 'javascript') {
      highlightedLine = highlightJS(line);
    } else if (language === 'json') {
      highlightedLine = highlightJSON(line);
    }

    return (
      <div key={index} className="flex">
        <span className="w-12 text-right pr-4 text-[#4a4a5e] select-none shrink-0">
          {index + 1}
        </span>
        <span className="flex-1">{highlightedLine}</span>
      </div>
    );
  });
}

function highlightPython(line: string): React.ReactNode {
  const comments = /#.*/g;

  const commentMatch = line.match(comments);
  if (commentMatch && commentMatch.index !== undefined) {
    const beforeComment = line.slice(0, commentMatch.index);
    const comment = line.slice(commentMatch.index);
    return (
      <>
        {highlightPythonNonComment(beforeComment)}
        <span className="text-[#4a4a5e]">{comment}</span>
      </>
    );
  }

  return highlightPythonNonComment(line);
}

function highlightPythonNonComment(line: string): React.ReactNode {
  const keywords = /\b(def|class|import|from|return|if|else|elif|for|while|try|except|with|as|in|not|and|or|True|False|None)\b/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = keywords.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} className="text-indigo-400">
        {match[0]}
      </span>
    );
    lastIndex = keywords.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : line;
}

function highlightJS(line: string): React.ReactNode {
  const keywords = /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|new|this|true|false|null|undefined)\b/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = keywords.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} className="text-indigo-400">
        {match[0]}
      </span>
    );
    lastIndex = keywords.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : line;
}

function highlightJSON(line: string): React.ReactNode {
  const keyMatch = line.match(/^(\s*)"([^"]+)":/);
  if (keyMatch) {
    return (
      <>
        {keyMatch[1]}
        <span className="text-indigo-400">"{keyMatch[2]}"</span>
        :{line.slice(keyMatch[0].length)}
      </>
    );
  }
  return line;
}

interface FileTreeItemProps {
  entry: FileEntry;
  selectedPath: string | null;
  onSelect: (entry: FileEntry) => void;
  depth?: number;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
}

function FileTreeItem({
  entry,
  selectedPath,
  onSelect,
  depth = 0,
  expandedFolders,
  onToggleFolder,
}: FileTreeItemProps) {
  const isSelected = selectedPath === entry.path;
  const isExpanded = expandedFolders.has(entry.path);
  const isDirectory = entry.type === 'directory';
  const paddingLeft = depth * 16 + 8;

  const handleClick = () => {
    if (isDirectory) {
      onToggleFolder(entry.path);
    } else {
      onSelect(entry);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm transition-all duration-200 rounded-lg ${
          isSelected
            ? 'bg-indigo-500/20 text-indigo-300'
            : 'text-[#e0e0e8] hover:bg-[#1a1a2e]'
        }`}
        style={{ paddingLeft }}
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
            <File className="w-4 h-4 text-[#7a7a8e] shrink-0" />
          </>
        )}
        <span className="truncate">{entry.name}</span>
      </button>

      {isDirectory && isExpanded && entry.children && (
        <div>
          {entry.children.map((child) => (
            <FileTreeItem
              key={child.path}
              entry={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkspaceTab({ agent }: WorkspaceTabProps) {
  const [fileTree, setFileTree] = useState<FileTree | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch file tree via API client
  const fetchFileTree = async () => {
    setIsLoadingTree(true);
    setError(null);

    try {
      const data = await getWorkspaceTree(agent.id);
      setFileTree(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace');
      setFileTree(null);
    } finally {
      setIsLoadingTree(false);
    }
  };

  // Fetch file content via API client
  const fetchFileContent = async (path: string) => {
    setIsLoadingContent(true);
    setFileContent(null);

    try {
      const data = await getWorkspaceFile(agent.id, path);
      setFileContent(data.content);
    } catch {
      setFileContent(null);
      setError('Failed to load file content');
    } finally {
      setIsLoadingContent(false);
    }
  };

  useEffect(() => {
    fetchFileTree();
  }, [agent.id]);

  useEffect(() => {
    if (selectedFile && selectedFile.type === 'file') {
      fetchFileContent(selectedFile.path);
    }
  }, [selectedFile]);

  const handleToggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleDownload = () => {
    if (!selectedFile || !fileContent) return;

    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const language = selectedFile ? getLanguageFromPath(selectedFile.path) : 'plaintext';

  return (
    <div className="flex h-full">
      {/* File tree sidebar */}
      <div className="w-64 border-r border-[#1e1e3a] flex flex-col bg-[#0a0a0f]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e3a]">
          <span className="text-sm font-medium text-[#e0e0e8]">Files</span>
          <button
            onClick={fetchFileTree}
            disabled={isLoadingTree}
            className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingTree ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-1">
          {isLoadingTree ? (
            <div className="flex items-center justify-center h-full text-[#4a4a5e]">
              <RefreshCw className="w-5 h-5 animate-spin" />
            </div>
          ) : error && !fileTree ? (
            <div className="flex flex-col items-center justify-center h-full text-[#4a4a5e] p-4">
              <AlertCircle className="w-8 h-8 mb-2 text-red-400" />
              <p className="text-sm text-center">{error}</p>
            </div>
          ) : fileTree ? (
            fileTree.entries.map((entry) => (
              <FileTreeItem
                key={entry.path}
                entry={entry}
                selectedPath={selectedFile?.path || null}
                onSelect={setSelectedFile}
                expandedFolders={expandedFolders}
                onToggleFolder={handleToggleFolder}
              />
            ))
          ) : (
            <div className="flex items-center justify-center h-full text-[#4a4a5e]">
              No files found
            </div>
          )}
        </div>
      </div>

      {/* File viewer */}
      <div className="flex-1 flex flex-col bg-[#0a0a0f]">
        {selectedFile ? (
          <>
            {/* File header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e3a]">
              <div className="flex items-center gap-2 min-w-0">
                <File className="w-4 h-4 text-[#7a7a8e] shrink-0" />
                <span className="text-sm text-[#e0e0e8] truncate">
                  {selectedFile.path}
                </span>
                <span className="text-xs text-[#4a4a5e] px-2 py-0.5 bg-[#1a1a2e] rounded-xl">
                  {language}
                </span>
              </div>
              <button
                onClick={handleDownload}
                disabled={!fileContent}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>

            {/* File content */}
            <div className="flex-1 overflow-auto p-4">
              {isLoadingContent ? (
                <div className="flex items-center justify-center h-full text-[#4a4a5e]">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
              ) : fileContent !== null ? (
                <pre className="font-mono text-sm text-[#e0e0e8] leading-relaxed">
                  {highlightSyntax(fileContent, language)}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-full text-[#4a4a5e]">
                  Failed to load file content
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-[#4a4a5e]">
            <div className="text-center">
              <Folder className="w-12 h-12 mx-auto mb-3 text-[#1e1e3a]" />
              <p className="text-sm">Select a file to view its contents</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
