import { useCallback, useEffect, useRef } from 'react';
import type { LogEntry, TimestampFormat } from '../../../types';
import { LogEntryRow } from './LogEntryRow';

const ROW_HEIGHT = 28;
const OVERSCAN = 20;

interface LogVirtualListProps {
  entries: LogEntry[];
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  autoScroll: boolean;
  onAutoScrollChange: (v: boolean) => void;
  timestampFormat?: TimestampFormat;
}

export function LogVirtualList({
  entries,
  expandedIds,
  onToggleExpand,
  autoScroll,
  onAutoScrollChange,
  timestampFormat = 'HH:mm:ss.SSS',
}: LogVirtualListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const isUserScrolling = useRef(false);

  // Calculate total height (expanded rows are taller)
  const getRowHeight = useCallback(
    (index: number) => {
      const entry = entries[index];
      if (entry && expandedIds.has(entry.id)) {
        // Expanded: estimate based on raw text lines
        const lineCount = Math.max(1, entry.rawText.split('\n').length);
        return ROW_HEIGHT + 20 + lineCount * 18;
      }
      return ROW_HEIGHT;
    },
    [entries, expandedIds],
  );

  // Get cumulative offset for a given index
  const getOffsetForIndex = useCallback(
    (targetIndex: number) => {
      let offset = 0;
      for (let i = 0; i < targetIndex; i++) {
        offset += getRowHeight(i);
      }
      return offset;
    },
    [getRowHeight],
  );

  // With no expanded rows every row is ROW_HEIGHT, so all offset math collapses
  // to arithmetic — the O(n) scans below only run while something is expanded.
  const uniformHeights = expandedIds.size === 0;

  // Total content height
  const totalHeight = uniformHeights
    ? entries.length * ROW_HEIGHT
    : getOffsetForIndex(entries.length);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries.length, autoScroll]);

  const handleScrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    isUserScrolling.current = false;
    onAutoScrollChange(true);
  }, [onAutoScrollChange]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < ROW_HEIGHT;

    // Detect scroll direction
    if (scrollTop < lastScrollTop.current) {
      // Scrolling up — disable auto-scroll
      if (autoScroll) {
        isUserScrolling.current = true;
        onAutoScrollChange(false);
      }
    } else if (isAtBottom && !autoScroll) {
      // Scrolled to bottom — re-enable auto-scroll
      isUserScrolling.current = false;
      onAutoScrollChange(true);
    }

    lastScrollTop.current = scrollTop;
  }, [autoScroll, onAutoScrollChange]);

  // Calculate visible range
  const container = containerRef.current;
  const scrollTop = container?.scrollTop ?? 0;
  const viewportHeight = container?.clientHeight ?? 600;

  let startIndex: number;
  let endIndex: number;
  if (uniformHeights) {
    startIndex = Math.min(entries.length, Math.floor(scrollTop / ROW_HEIGHT));
    endIndex = Math.min(entries.length, startIndex + Math.ceil(viewportHeight / ROW_HEIGHT) + 1);
  } else {
    // Find start index by scanning offsets
    startIndex = 0;
    let accumulatedHeight = 0;
    for (let i = 0; i < entries.length; i++) {
      const h = getRowHeight(i);
      if (accumulatedHeight + h > scrollTop) {
        startIndex = i;
        break;
      }
      accumulatedHeight += h;
      if (i === entries.length - 1) {
        startIndex = entries.length;
      }
    }

    // Find end index
    endIndex = startIndex;
    let visibleHeight = 0;
    for (let i = startIndex; i < entries.length; i++) {
      visibleHeight += getRowHeight(i);
      endIndex = i + 1;
      if (visibleHeight >= viewportHeight) break;
    }
  }

  // Apply overscan
  const overscanStart = Math.max(0, startIndex - OVERSCAN);
  const overscanEnd = Math.min(entries.length, endIndex + OVERSCAN);

  // Calculate offset for the first rendered row
  const offsetTop = uniformHeights
    ? overscanStart * ROW_HEIGHT
    : getOffsetForIndex(overscanStart);

  return (
    <div className="log-virtual-list__wrap">
      <div
        ref={containerRef}
        className="log-virtual-list"
        onScroll={handleScroll}
      >
        <div className="log-virtual-list__spacer" style={{ height: totalHeight }}>
          <div
            className="log-virtual-list__viewport"
            style={{ transform: `translateY(${offsetTop}px)` }}
          >
            {entries.slice(overscanStart, overscanEnd).map((entry) => (
              <LogEntryRow
                key={entry.id}
                entry={entry}
                isExpanded={expandedIds.has(entry.id)}
                onToggle={() => onToggleExpand(entry.id)}
                timestampFormat={timestampFormat}
              />
            ))}
          </div>
        </div>
      </div>
      {!autoScroll && (
        <button
          type="button"
          className="log-virtual-list__scroll-down"
          onClick={handleScrollToBottom}
          title="Scroll to bottom"
        >
          ↓
        </button>
      )}
    </div>
  );
}
