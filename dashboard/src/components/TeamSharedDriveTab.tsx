import { useState, useEffect, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
  AlertCircle,
  Download,
} from 'lucide-react';
import { getTeamSharedTree, getTeamSharedFile, downloadTeamSharedFile } from '../api/teams';
import type { FileEntry } from '../api/agents';

interface TeamSharedDriveTabProps {
  teamId: string;
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', json: 'json', md: 'markdown', css: 'css', html: 'html',
    yaml: 'yaml', yml: 'yaml', sh: 'bash', bash: 'bash',
  };
  return languageMap[ext] || 'plaintext';
}

function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext);
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    bmp: 'image/bmp', ico: 'image/x-icon', webp: 'image/webp', svg: 'image/svg+xml',
  };
  return mimeMap[ext] || 'application/octet-stream';
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

export function TeamSharedDriveTab({ teamId }: TeamSharedDriveTabProps) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileEncoding, setFileEncoding] = useState<'utf-8' | 'base64'>('utf-8');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTree = useCallback(async () => {
    setIsLoadingTree(true);
    setError(null);
    try {
      const data = await getTeamSharedTree(teamId);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shared drive');
      setEntries([]);
    } finally {
      setIsLoadingTree(false);
    }
  }, [teamId]);

  const fetchFileContent = useCallback(async (filePath: string) => {
    setIsLoadingContent(true);
    setFileContent(null);
    setFileEncoding('utf-8');
    try {
      const data = await getTeamSharedFile(teamId, filePath);
      setFileContent(data.content);
      setFileEncoding(data.encoding || 'utf-8');
    } catch {
      setFileContent(null);
      setError('Failed to load file content');
    } finally {
      setIsLoadingContent(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  useEffect(() => {
    if (selectedFile && selectedFile.type === 'file') {
      fetchFileContent(selectedFile.path);
    }
  }, [selectedFile, fetchFileContent]);

  const handleToggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleDownload = async () => {
    if (!selectedFile) return;
    setIsDownloading(true);
    try {
      await downloadTeamSharedFile(teamId, selectedFile.path, selectedFile.name);
    } catch (err) {
      console.error('Download failed:', err);
      setError('Failed to download file');
    } finally {
      setIsDownloading(false);
    }
  };

  const language = selectedFile ? getLanguageFromPath(selectedFile.path) : 'plaintext';

  return (
    <div className="flex h-full">
      {/* File tree sidebar */}
      <div className="w-64 border-r border-[#1e1e3a] flex flex-col bg-[#0a0a0f]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e3a]">
          <span className="text-sm font-medium text-[#e0e0e8]">Shared Drive</span>
          <button
            onClick={fetchTree}
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
          ) : error && entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#4a4a5e] p-4">
              <AlertCircle className="w-8 h-8 mb-2 text-red-400" />
              <p className="text-sm text-center">{error}</p>
            </div>
          ) : entries.length > 0 ? (
            entries.map((entry) => (
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
              <p className="text-sm">Shared drive is empty</p>
            </div>
          )}
        </div>
      </div>

      {/* File viewer */}
      <div className="flex-1 flex flex-col bg-[#0a0a0f]">
        {selectedFile ? (
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e1e3a] min-w-0">
              <File className="w-4 h-4 text-[#7a7a8e] shrink-0" />
              <span className="text-sm text-[#e0e0e8] truncate flex-1">{selectedFile.path}</span>
              <span className="text-xs text-[#4a4a5e] px-2 py-0.5 bg-[#1a1a2e] rounded-xl">{language}</span>
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl transition-all duration-200 disabled:opacity-50"
                title="Download file"
              >
                <Download className={`w-4 h-4 ${isDownloading ? 'animate-pulse' : ''}`} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {isLoadingContent ? (
                <div className="flex items-center justify-center h-full text-[#4a4a5e]">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
              ) : fileContent !== null ? (
                fileEncoding === 'base64' ? (
                  isImageFile(selectedFile.name) ? (
                    <div className="flex items-center justify-center h-full">
                      <img
                        src={`data:${getMimeType(selectedFile.name)};base64,${fileContent}`}
                        alt={selectedFile.name}
                        className="max-w-full max-h-full object-contain rounded"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[#4a4a5e]">
                      <File className="w-12 h-12 mb-3 text-[#1e1e3a]" />
                      <p className="text-sm">Binary file</p>
                    </div>
                  )
                ) : (
                  <pre className="font-mono text-sm text-[#e0e0e8] leading-relaxed whitespace-pre-wrap">
                    {fileContent}
                  </pre>
                )
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
