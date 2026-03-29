import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './CommandPalette.css';

export interface PaletteAction {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  handler: () => void;
}

interface CommandPaletteProps {
  actions: PaletteAction[];
  onClose: () => void;
}

export function CommandPalette({ actions, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fuzzy filter
  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    const lower = query.toLowerCase();
    return actions
      .map((action) => {
        const label = action.label.toLowerCase();
        const category = action.category.toLowerCase();
        const text = `${category} ${label}`;
        let score = 0;
        let qi = 0;
        for (let i = 0; i < text.length && qi < lower.length; i++) {
          if (text[i] === lower[qi]) {
            score += 1;
            qi++;
          }
        }
        return { action, matched: qi === lower.length, score };
      })
      .filter((r) => r.matched)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.action);
  }, [actions, query]);

  // Reset selection on filter change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const execute = useCallback(
    (action: PaletteAction) => {
      onClose();
      action.handler();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[selectedIndex]) {
            execute(filtered[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered, selectedIndex, execute, onClose],
  );

  return (
    <div className="command-palette__backdrop" onClick={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          className="command-palette__input"
          type="text"
          placeholder="Type a command..."
          aria-autocomplete="list"
          aria-controls="command-palette-listbox"
          aria-activedescendant={filtered[selectedIndex] ? `command-palette-option-${filtered[selectedIndex].id}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="command-palette__list" ref={listRef} id="command-palette-listbox" role="listbox" aria-label="Commands">
          {filtered.length === 0 && (
            <div className="command-palette__empty" aria-live="polite">No matching commands</div>
          )}
          {filtered.map((action, i) => (
            <div
              key={action.id}
              id={`command-palette-option-${action.id}`}
              role="option"
              aria-selected={i === selectedIndex}
              className={`command-palette__item ${i === selectedIndex ? 'command-palette__item--selected' : ''}`}
              onClick={() => execute(action)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="command-palette__item-category">{action.category}</span>
              <span className="command-palette__item-label">{action.label}</span>
              {action.shortcut && (
                <span className="command-palette__item-shortcut">{action.shortcut}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
