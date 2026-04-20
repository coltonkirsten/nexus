import { useEffect } from 'react';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export interface ShortcutHandlers {
  onSlash?: () => void;
  onQuestionMark?: () => void;
  onEscape?: () => void;
}

export function useGlobalKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handlers.onEscape?.();
        return;
      }
      if (isEditable(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '/' && handlers.onSlash) {
        e.preventDefault();
        handlers.onSlash();
      } else if (e.key === '?' && handlers.onQuestionMark) {
        e.preventDefault();
        handlers.onQuestionMark();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlers]);
}

// Focuses the first element marked with data-search-input on the page, if any.
export function focusSearchInput() {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    '[data-search-input]'
  );
  if (el) {
    el.focus();
    el.select?.();
  }
}
