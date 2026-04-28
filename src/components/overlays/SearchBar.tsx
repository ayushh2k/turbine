import { useEffect, useRef, useCallback } from 'react';
import { useSearchStore } from '../../state/searchStore';
import './SearchBar.css';

export function SearchBar() {
  const visible = useSearchStore((s) => s.visible);
  const query = useSearchStore((s) => s.query);
  const paneScope = useSearchStore((s) => s.paneScope);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setPaneScope = useSearchStore((s) => s.setPaneScope);
  const findNext = useSearchStore((s) => s.findNext);
  const findPrevious = useSearchStore((s) => s.findPrevious);
  const close = useSearchStore((s) => s.close);

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when search bar opens
  useEffect(() => {
    if (visible) {
      // Small delay to ensure DOM is rendered
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [visible]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          findPrevious();
        } else {
          findNext();
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    },
    [findNext, findPrevious, close],
  );

  if (!visible) return null;

  return (
    <div className="search-bar" role="search" aria-label="Search across panes">
      <input
        ref={inputRef}
        className="search-bar__input"
        type="text"
        placeholder="Search terminals..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search query"
      />
      <button
        className="search-bar__btn"
        title="Previous match (Shift+Enter)"
        onClick={findPrevious}
        aria-label="Find previous"
      >
        &#9650;
      </button>
      <button
        className="search-bar__btn"
        title="Next match (Enter)"
        onClick={findNext}
        aria-label="Find next"
      >
        &#9660;
      </button>
      <div className="search-bar__separator" />
      <label className="search-bar__scope">
        <input
          type="checkbox"
          checked={paneScope === 'all'}
          onChange={(e) => setPaneScope(e.target.checked ? 'all' : 'focused')}
        />
        Search all panes
      </label>
      <div className="search-bar__separator" />
      <button
        className="search-bar__btn search-bar__close"
        title="Close (Escape)"
        onClick={close}
        aria-label="Close search"
      >
        &#215;
      </button>
    </div>
  );
}
