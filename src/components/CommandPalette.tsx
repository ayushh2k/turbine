import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './CommandPalette.css';

export interface PaletteAction {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  type: 'command' | 'file';
  /** For file actions: the full path used to derive a breadcrumb */
  filePath?: string;
  handler: () => void;
}

interface CommandPaletteProps {
  actions: PaletteAction[];
  onClose: () => void;
}

/** Extract the directory breadcrumb from a path, e.g. "src/components/Foo.tsx" → "src/components" */
function fileBreadcrumb(path: string | undefined): string {
  if (!path) return '';
  const parts = path.replace(/\\/g, '/').split('/');
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

/** Simple file extension → icon map */
function fileIcon(label: string): string {
  const ext = label.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: '⬡', tsx: '⬡', js: '◈', jsx: '◈',
    rs: '⚙', py: '◆', go: '◇', java: '♦',
    json: '{}', yaml: '⊞', yml: '⊞', toml: '⊞',
    md: '¶', css: '◉', html: '◎', svg: '▲',
    png: '▣', jpg: '▣', jpeg: '▣', gif: '▣', webp: '▣',
    sh: '⌘', bash: '⌘', zsh: '⌘',
  };
  return map[ext] ?? '◻';
}

function fuzzyMatch(text: string, query: string): { matched: boolean; score: number } {
  let score = 0;
  let qi = 0;
  let lastMatchIndex = -1;
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) {
      score += 1;
      // Bonus for consecutive matches
      if (lastMatchIndex === i - 1) score += 2;
      // Bonus for matching at start or after separator
      if (i === 0 || text[i - 1] === '/' || text[i - 1] === ' ' || text[i - 1] === '.') score += 3;
      lastMatchIndex = i;
      qi++;
    }
  }
  return { matched: qi === query.length, score };
}

export function CommandPalette({ actions, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isCommandMode = query.startsWith('>');
  const searchQuery = isCommandMode ? query.slice(1).trimStart() : query;

  const filtered = useMemo(() => {
    // Determine which action types to show
    const pool = isCommandMode
      ? actions.filter((a) => a.type === 'command')
      : query.trim()
        ? actions // search all, but files ranked higher
        : actions.filter((a) => a.type === 'file').slice(0, 50); // default: show recent files

    if (!searchQuery.trim()) {
      // No query: if command mode, show all commands; if file mode, show first batch
      return isCommandMode ? pool : pool.slice(0, 50);
    }

    const lower = searchQuery.toLowerCase();
    return pool
      .map((action) => {
        // For files, match against the filename + relative path
        const matchText = action.type === 'file'
          ? (action.filePath ?? action.label).toLowerCase()
          : `${action.category} ${action.label}`.toLowerCase();
        const result = fuzzyMatch(matchText, lower);
        // Give files a bonus when not in command mode
        const typeBonus = !isCommandMode && action.type === 'file' ? 10 : 0;
        return { action, matched: result.matched, score: result.score + typeBonus };
      })
      .filter((r) => r.matched)
      .sort((a, b) => b.score - a.score)
      .slice(0, 100)
      .map((r) => r.action);
  }, [actions, query, searchQuery, isCommandMode]);

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
          placeholder={isCommandMode ? 'Type a command...' : 'Search files (type > for commands)...'}
          aria-autocomplete="list"
          aria-controls="command-palette-listbox"
          aria-activedescendant={filtered[selectedIndex] ? `command-palette-option-${filtered[selectedIndex].id}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="command-palette__mode-indicator">
          {isCommandMode ? '⌘ Commands' : '◻ Files'}
          {!isCommandMode && <span className="command-palette__mode-hint">Type <kbd>&gt;</kbd> for commands</span>}
        </div>
        <div className="command-palette__list" ref={listRef} id="command-palette-listbox" role="listbox" aria-label="Results">
          {filtered.length === 0 && (
            <div className="command-palette__empty" aria-live="polite">
              {isCommandMode ? 'No matching commands' : 'No matching files'}
            </div>
          )}
          {filtered.map((action, i) => (
            <div
              key={action.id}
              id={`command-palette-option-${action.id}`}
              role="option"
              aria-selected={i === selectedIndex}
              className={`command-palette__item ${i === selectedIndex ? 'command-palette__item--selected' : ''} command-palette__item--${action.type}`}
              onClick={() => execute(action)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {action.type === 'file' ? (
                <>
                  <span className="command-palette__file-icon">{fileIcon(action.label)}</span>
                  <span className="command-palette__item-label">{action.label.split('/').pop()}</span>
                  <span className="command-palette__file-breadcrumb">{fileBreadcrumb(action.filePath ?? action.label)}</span>
                </>
              ) : (
                <>
                  <span className="command-palette__item-category">{action.category}</span>
                  <span className="command-palette__item-label">{action.label}</span>
                  {action.shortcut && (
                    <span className="command-palette__item-shortcut">{action.shortcut}</span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
