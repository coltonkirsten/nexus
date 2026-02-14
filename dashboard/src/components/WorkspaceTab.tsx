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

interface WorkspaceTabProps {
  agent: Agent;
}

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileEntry[];
}

interface FileTree {
  entries: FileEntry[];
}

// Mock data for development
const MOCK_FILE_TREE: FileTree = {
  entries: [
    { name: 'README.md', type: 'file', path: '/workspace/README.md' },
    { name: 'main.py', type: 'file', path: '/workspace/main.py' },
    { name: 'config.json', type: 'file', path: '/workspace/config.json' },
    {
      name: 'src',
      type: 'directory',
      path: '/workspace/src',
      children: [
        { name: 'index.ts', type: 'file', path: '/workspace/src/index.ts' },
        { name: 'utils.ts', type: 'file', path: '/workspace/src/utils.ts' },
        {
          name: 'components',
          type: 'directory',
          path: '/workspace/src/components',
          children: [
            { name: 'Button.tsx', type: 'file', path: '/workspace/src/components/Button.tsx' },
            { name: 'Modal.tsx', type: 'file', path: '/workspace/src/components/Modal.tsx' },
          ],
        },
      ],
    },
    {
      name: 'tests',
      type: 'directory',
      path: '/workspace/tests',
      children: [
        { name: 'test_main.py', type: 'file', path: '/workspace/tests/test_main.py' },
      ],
    },
  ],
};

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
      // Highlight Python keywords and strings
      highlightedLine = highlightPython(line);
    } else if (language === 'typescript' || language === 'javascript') {
      highlightedLine = highlightJS(line);
    } else if (language === 'json') {
      highlightedLine = highlightJSON(line);
    }

    return (
      <div key={index} className="flex">
        <span className="w-12 text-right pr-4 text-gray-600 select-none shrink-0">
          {index + 1}
        </span>
        <span className="flex-1">{highlightedLine}</span>
      </div>
    );
  });
}

function highlightPython(line: string): React.ReactNode {
  const comments = /#.*/g;

  // Handle comments first
  const commentMatch = line.match(comments);
  if (commentMatch && commentMatch.index !== undefined) {
    const beforeComment = line.slice(0, commentMatch.index);
    const comment = line.slice(commentMatch.index);
    return (
      <>
        {highlightPythonNonComment(beforeComment)}
        <span className="text-gray-500">{comment}</span>
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
      <span key={match.index} className="text-purple-400">
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
      <span key={match.index} className="text-purple-400">
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
  // Highlight keys and values
  const keyMatch = line.match(/^(\s*)"([^"]+)":/);
  if (keyMatch) {
    return (
      <>
        {keyMatch[1]}
        <span className="text-blue-400">"{keyMatch[2]}"</span>
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
        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm transition-colors ${
          isSelected
            ? 'bg-blue-600/30 text-blue-300'
            : 'text-gray-300 hover:bg-gray-700/50'
        }`}
        style={{ paddingLeft }}
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
            <File className="w-4 h-4 text-gray-400 shrink-0" />
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

  // Fetch file tree
  const fetchFileTree = async () => {
    setIsLoadingTree(true);
    setError(null);

    try {
      const response = await fetch(
        `http://localhost:3001/api/agents/${agent.id}/workspace`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch workspace');
      }

      const data = await response.json();
      setFileTree(data);
    } catch (err) {
      console.warn('Using mock data:', err);
      // Fall back to mock data for development
      setFileTree(MOCK_FILE_TREE);
    } finally {
      setIsLoadingTree(false);
    }
  };

  // Fetch file content
  const fetchFileContent = async (path: string) => {
    setIsLoadingContent(true);
    setFileContent(null);

    try {
      const response = await fetch(
        `http://localhost:3001/api/agents/${agent.id}/workspace/file?path=${encodeURIComponent(path)}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch file content');
      }

      const data = await response.json();
      setFileContent(data.content);
    } catch (err) {
      console.warn('Using mock content:', err);
      // Mock content for development
      setFileContent(`// Mock content for ${path}\n\nThis is placeholder content for the file.\nReplace with actual API integration.`);
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
      <div className="w-64 border-r border-gray-700 flex flex-col bg-gray-900/50">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="text-sm font-medium text-gray-300">Files</span>
          <button
            onClick={fetchFileTree}
            disabled={isLoadingTree}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingTree ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {isLoadingTree ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <RefreshCw className="w-5 h-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4">
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
            <div className="flex items-center justify-center h-full text-gray-500">
              No files found
            </div>
          )}
        </div>
      </div>

      {/* File viewer */}
      <div className="flex-1 flex flex-col bg-gray-950">
        {selectedFile ? (
          <>
            {/* File header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <div className="flex items-center gap-2 min-w-0">
                <File className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-300 truncate">
                  {selectedFile.path}
                </span>
                <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-800 rounded">
                  {language}
                </span>
              </div>
              <button
                onClick={handleDownload}
                disabled={!fileContent}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>

            {/* File content */}
            <div className="flex-1 overflow-auto p-4">
              {isLoadingContent ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
              ) : fileContent !== null ? (
                <pre className="font-mono text-sm text-gray-300 leading-relaxed">
                  {highlightSyntax(fileContent, language)}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Failed to load file content
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <Folder className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-sm">Select a file to view its contents</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
