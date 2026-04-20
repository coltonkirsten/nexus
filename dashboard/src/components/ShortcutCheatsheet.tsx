import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ShortcutCheatsheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  description: string;
}

const shortcuts: ShortcutRow[] = [
  { keys: ['?'], description: 'Show keyboard shortcuts' },
  { keys: ['/'], description: 'Focus search / filter' },
  { keys: ['Esc'], description: 'Close modal or drawer' },
  { keys: ['⌘', 'Enter'], description: 'Send message (in reply composer)' },
];

export function ShortcutCheatsheet({ isOpen, onClose }: ShortcutCheatsheetProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0f0f18] border border-[#1e1e3a] rounded-2xl p-5 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#e0e0e8]">Keyboard Shortcuts</h3>
          <button
            onClick={onClose}
            className="p-1 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded transition-all duration-200"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2">
          {shortcuts.map((sc, i) => (
            <div key={i} className="flex items-center justify-between gap-4 text-xs">
              <span className="text-[#7a7a8e]">{sc.description}</span>
              <div className="flex items-center gap-1 shrink-0">
                {sc.keys.map((k, j) => (
                  <kbd
                    key={j}
                    className="px-2 py-0.5 bg-[#1a1a2e] border border-[#2a2a4a] rounded text-[10px] text-[#e0e0e8] font-mono min-w-[22px] text-center"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
