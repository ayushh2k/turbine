import { useState, useRef, useEffect, useCallback } from 'react';
import type { SearchAddon } from '@xterm/addon-search';
import './TerminalSearch.css';

interface TerminalSearchProps {
  searchAddon: SearchAddon;
  onClose: () => void;
}

export function TerminalSearch({ searchAddon, onClose }: TerminalSearchProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const findNext = useCallback(() => {
    if (query) searchAddon.findNext(query);
  }, [query, searchAddon]);

  const findPrevious = useCallback(() => {
    if (query) searchAddon.findPrevious(query);
  }, [query, searchAddon]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.shiftKey ? findPrevious() : findNext();
      }
      if (e.key === 'Escape') {
        searchAddon.clearDecorations();
        onClose();
      }
    },
    [findNext, findPrevious, onClose, searchAddon],
  );

  // Live search as user types
  useEffect(() => {
    if (query) {
      searchAddon.findNext(query);
    } else {
      searchAddon.clearDecorations();
    }
  }, [query, searchAddon]);

  return (
    <div className="terminal-search" role="search">
      <input
        ref={inputRef}
        className="terminal-search__input"
        type="text"
        placeholder="Search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search terminal"
      />
      <button
        className="terminal-search__btn"
        title="Previous (Shift+Enter)"
        onClick={findPrevious}
        aria-label="Find previous"
      >
        ▲
      </button>
      <button
        className="terminal-search__btn"
        title="Next (Enter)"
        onClick={findNext}
        aria-label="Find next"
      >
        ▼
      </button>
      <button
        className="terminal-search__btn terminal-search__close"
        title="Close (Esc)"
        onClick={() => {
          searchAddon.clearDecorations();
          onClose();
        }}
        aria-label="Close search"
      >
        ×
      </button>
    </div>
  );
}
