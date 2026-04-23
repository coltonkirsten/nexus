import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Cpu, Users, HardDrive, Cog, CornerDownLeft } from 'lucide-react';
import type { Agent, Team } from '../../types/agent';
import { listAgents } from '../../api/agents';
import { listTeams } from '../../api/teams';
import { useOrchestratorDispatch } from './OrchestratorContext';

type Item =
  | { kind: 'agent'; id: string; name: string }
  | { kind: 'team'; id: string; name: string }
  | { kind: 'page'; id: string; name: string; path: string };

const staticPages: Item[] = [
  { kind: 'page', id: 'page-volumes', name: 'Volumes', path: '/volumes' },
  { kind: 'page', id: 'page-settings', name: 'Settings', path: '/settings' },
  { kind: 'page', id: 'page-orchestrator', name: 'Orchestrator', path: '/' },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dispatch = useOrchestratorDispatch();
  const navigate = useNavigate();

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: listAgents,
    enabled: isOpen,
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: listTeams,
    enabled: isOpen,
  });

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...teams.map((t) => ({ kind: 'team' as const, id: t.id, name: t.name })),
      ...agents.map((a) => ({ kind: 'agent' as const, id: a.id, name: a.name })),
      ...staticPages,
    ];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((i) => i.name.toLowerCase().includes(q));
  }, [agents, teams, query]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[selectedIdx];
        if (item) activate(item);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, items, selectedIdx]);

  // Keep selected item visible
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  const activate = (item: Item) => {
    if (item.kind === 'agent') {
      dispatch({ type: 'OPEN_TAB', payload: { tabType: 'agent', entityId: item.id, label: item.name } });
    } else if (item.kind === 'team') {
      dispatch({ type: 'OPEN_TAB', payload: { tabType: 'team', entityId: item.id, label: item.name } });
    } else {
      navigate(item.path);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-[#0a0a0f] border border-[#1e1e3a] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e1e3a]">
          <Search className="w-4 h-4 text-[#4a4a5e]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to agent, team, or page…"
            className="flex-1 bg-transparent text-sm text-[#e0e0e8] placeholder-[#4a4a5e] focus:outline-none"
          />
          <span className="text-[10px] text-[#4a4a5e] font-mono">ESC</span>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[#4a4a5e]">No matches</div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIdx;
              const Icon = item.kind === 'agent' ? Cpu : item.kind === 'team' ? Users : item.id === 'page-volumes' ? HardDrive : Cog;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  data-idx={idx}
                  onClick={() => activate(item)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isSelected ? 'bg-indigo-500/10' : ''
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-[#4a4a5e]'}`} />
                  <span className={`flex-1 text-sm truncate ${isSelected ? 'text-[#e0e0e8]' : 'text-[#7a7a8e]'}`}>
                    {item.name}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-[#4a4a5e]">{item.kind}</span>
                  {isSelected && (
                    <CornerDownLeft className="w-3 h-3 text-indigo-400" />
                  )}
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[#1e1e3a] text-[10px] text-[#4a4a5e]">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
