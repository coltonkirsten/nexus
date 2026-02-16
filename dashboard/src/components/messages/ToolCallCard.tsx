import { useState } from 'react';
import { ChevronRight, ChevronDown, Terminal, FileText, Search, Pencil, FolderSearch } from 'lucide-react';
import type { ToolCall } from '../../types/agent';

interface ToolCallCardProps {
  toolCall: ToolCall;
}

const toolIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Bash: Terminal,
  Read: FileText,
  Write: FileText,
  Edit: Pencil,
  Grep: Search,
  Glob: FolderSearch,
};

function getToolPreview(toolCall: ToolCall): string {
  const input = toolCall.input;
  switch (toolCall.name) {
    case 'Bash':
      return (input.command as string) || '';
    case 'Read':
      return (input.file_path as string) || '';
    case 'Write':
      return (input.file_path as string) || '';
    case 'Edit':
      return (input.file_path as string) || '';
    case 'Grep':
      return (input.pattern as string) || '';
    case 'Glob':
      return (input.pattern as string) || '';
    default: {
      const firstValue = Object.values(input)[0];
      return typeof firstValue === 'string' ? firstValue.slice(0, 80) : toolCall.name;
    }
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = toolIcons[toolCall.name] || Terminal;
  const preview = getToolPreview(toolCall);

  return (
    <div className="my-2 rounded-xl border border-[#1e1e3a] bg-[#0f0f18] overflow-hidden transition-all duration-200">
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[#1a1a2e]/50 transition-colors"
      >
        <div className="text-[#4a4a5e]">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
        <div className={`p-1 rounded-lg ${toolCall.isError ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
          <Icon className={`w-3.5 h-3.5 ${toolCall.isError ? 'text-red-400' : 'text-emerald-400'}`} />
        </div>
        <span className="text-xs font-semibold text-[#7a7a8e]">{toolCall.name}</span>
        <span className="text-xs text-[#4a4a5e] truncate flex-1 font-mono">
          {truncate(preview, 80)}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[#1e1e3a]">
          {/* Input */}
          <div className="px-4 py-3">
            <div className="text-[10px] font-semibold text-[#4a4a5e] uppercase tracking-wider mb-2">Input</div>
            <pre className="text-xs text-[#e0e0e8] whitespace-pre-wrap break-words overflow-x-auto max-h-64 overflow-y-auto font-mono leading-relaxed">
              {typeof toolCall.input === 'string'
                ? toolCall.input
                : JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>

          {/* Result */}
          {toolCall.result !== undefined && (
            <div className="px-4 py-3 border-t border-[#1e1e3a]">
              <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${toolCall.isError ? 'text-red-400' : 'text-[#4a4a5e]'}`}>
                {toolCall.isError ? 'Error' : 'Output'}
              </div>
              <pre className={`text-xs whitespace-pre-wrap break-words overflow-x-auto max-h-96 overflow-y-auto font-mono leading-relaxed ${toolCall.isError ? 'text-red-300' : 'text-[#e0e0e8]'}`}>
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
