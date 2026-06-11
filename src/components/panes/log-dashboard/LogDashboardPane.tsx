import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { LogSourceConfig, SourceStatus, LogEntry } from '../../../types';
import { useLogDashboardStore } from '../../../state/logDashboardStore';
import { parseLine } from '../../../utils/logParser';
import { buildFilterPredicate } from '../../../utils/filterEngine';
import { drainPtyOutput } from '../../../utils/ptyData';
import {
  startSource,
  stopAllSources,
  restartSource,
  getSyntheticPaneId,
  fromRustLogSource,
  type RustLogSourceConfig,
} from '../../../utils/logStreamManager';
import { LogToolbar } from './LogToolbar';
import { LogSourcePanel } from './LogSourcePanel';
import { LogVirtualList } from './LogVirtualList';
import './LogDashboard.css';

interface LogDashboardPaneProps {
  paneId: string;
  workspaceId: string;
  onFocus: () => void;
}

// Output flood guard: a chatty source (e.g. `docker logs` dumping history) can emit
// tens of thousands of pty_output events per second. Parsing and committing to the
// store per line saturates the webview main thread and balloons memory until WebKit
// kills the content process. Buffer raw chunks, cap them, and flush on an interval.
const FLUSH_INTERVAL_MS = 100;
const MAX_PENDING_CHARS = 512_000;
// Rows handed to the virtual list. The full ring buffer stays available for
// filtering, but rendering 100k rows means a ~3M-px scroll spacer whose
// forced layouts (auto-scroll writes scrollTop every flush) hammer WebKit.
const MAX_RENDERED_ENTRIES = 5_000;
// parseLine (regexes + UUID) is the per-entry cost ceiling: 2k entries per flush
// keeps a worst-case flood at ~20k parsed lines/s; older lines are dropped, which
// matches tail semantics — the ring buffer would evict them shortly anyway.
const MAX_ENTRIES_PER_FLUSH = 2_000;

interface PendingChunk {
  sourceId: string;
  sourceLabel: string;
  sourceColor: string;
  text: string;
}

export function LogDashboardPane({ paneId, workspaceId, onFocus }: LogDashboardPaneProps) {
  const initDashboard = useLogDashboardStore((s) => s.initDashboard);
  const destroyDashboard = useLogDashboardStore((s) => s.destroyDashboard);
  const addEntries = useLogDashboardStore((s) => s.addEntries);
  const dashboard = useLogDashboardStore((s) => s.dashboards.get(paneId));
  const toggleExpanded = useLogDashboardStore((s) => s.toggleExpanded);
  const setAutoScroll = useLogDashboardStore((s) => s.setAutoScroll);
  const updateSourceStatus = useLogDashboardStore((s) => s.updateSourceStatus);

  const [showSourcePanel, setShowSourcePanel] = useState(false);
  const [sourceStatuses, setSourceStatuses] = useState<Map<string, SourceStatus>>(new Map());
  const unlistenRef = useRef<(() => void) | null>(null);
  const unlistenExitRef = useRef<(() => void) | null>(null);
  const sourcesRef = useRef<LogSourceConfig[]>([]);

  // Keep sourcesRef in sync
  useEffect(() => {
    sourcesRef.current = dashboard?.sources ?? [];
  }, [dashboard?.sources]);

  // Initialize dashboard on mount
  useEffect(() => {
    initDashboard(paneId);

    // Load saved sources and auto-start them
    invoke<RustLogSourceConfig[]>('load_log_sources', { paneId })
      .then(async (rows) => {
        const savedSources = rows.map(fromRustLogSource);
        if (savedSources && savedSources.length > 0) {
          const store = useLogDashboardStore.getState();
          for (const source of savedSources) {
            store.addSource(paneId, source);
          }
          // Start all sources
          for (let i = 0; i < savedSources.length; i++) {
            try {
              await startSource(paneId, savedSources[i], i);
              setSourceStatuses((prev) => {
                const next = new Map(prev);
                next.set(savedSources[i].id, 'running');
                return next;
              });
            } catch {
              setSourceStatuses((prev) => {
                const next = new Map(prev);
                next.set(savedSources[i].id, 'error');
                return next;
              });
            }
          }
        }
      })
      .catch(() => {});

    return () => {
      // Stop all sources and destroy dashboard
      const sourceCount = sourcesRef.current.length;
      stopAllSources(paneId, sourceCount).catch(() => {});
      destroyDashboard(paneId);
    };
  }, [paneId, initDashboard, destroyDashboard]);

  // Set up pty_output event listener. Events only buffer raw text; parsing and
  // store commits happen on a timer so a flood of events stays cheap per event.
  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    const decoder = new TextDecoder();
    let pending: PendingChunk[] = [];
    let pendingChars = 0;
    let flushTimer: number | null = null;

    const flush = () => {
      flushTimer = null;
      if (pending.length === 0) return;
      const chunks = pending;
      pending = [];
      pendingChars = 0;

      const lines: { line: string; chunk: PendingChunk }[] = [];
      for (const chunk of chunks) {
        for (const line of chunk.text.split('\n')) {
          if (line.trim().length === 0) continue;
          lines.push({ line, chunk });
        }
      }

      const tail = lines.length > MAX_ENTRIES_PER_FLUSH ? lines.slice(-MAX_ENTRIES_PER_FLUSH) : lines;
      const entries: LogEntry[] = tail.map(({ line, chunk }) =>
        parseLine(line, chunk.sourceId, chunk.sourceLabel, chunk.sourceColor),
      );
      addEntries(paneId, entries);
    };

    // 4Hz drain: the Rust side keeps only the newest 4MB for log panes, so
    // slow pulls bound JS-side ingest without losing the tail.
    const drainSource = (eventPaneId: string, sourceIndex: number) =>
      drainPtyOutput(eventPaneId, (bytes) => {
          const source = sourcesRef.current[sourceIndex];
          if (!source) return;
          // Only the newest MAX_PENDING_CHARS survive the cap below — skip
          // decoding bytes that would be dropped immediately.
          const tail =
            bytes.length > MAX_PENDING_CHARS
              ? bytes.subarray(bytes.length - MAX_PENDING_CHARS)
              : bytes;
          pending.push({
            sourceId: source.id,
            sourceLabel: source.displayName,
            sourceColor: source.color ?? '#00e5c8',
            text: decoder.decode(tail),
          });
          pendingChars += pending[pending.length - 1].text.length;

          // Cap pending backlog: drop oldest chunks beyond the cap — the ring
          // buffer would discard them after parsing anyway.
          while (pendingChars > MAX_PENDING_CHARS && pending.length > 1) {
            pendingChars -= pending[0].text.length;
            pending.shift();
          }

          if (flushTimer == null) {
            flushTimer = window.setTimeout(flush, FLUSH_INTERVAL_MS);
          }
        }, 250);

    const setupListener = async () => {
      const unlisten = await appWindow.listen<{ pane_id: string }>(
        'pty_data_ready',
        (event) => {
          const { pane_id: eventPaneId } = event.payload;

          // Check if this event is for one of our synthetic pane IDs
          if (!eventPaneId.startsWith(`log_${paneId}_`)) return;

          // Find which source this belongs to
          const sources = sourcesRef.current;
          const sourceIndex = sources.findIndex(
            (_, idx) => getSyntheticPaneId(paneId, idx) === eventPaneId,
          );
          if (sourceIndex === -1) return;

          drainSource(eventPaneId, sourceIndex);
        },
      );
      unlistenRef.current = unlisten;
    };

    setupListener();

    // The data-ready signal only fires on the buffer's empty→non-empty
    // transition, so a signal emitted before the listener attached (or lost to
    // a webview reload) would stall a source forever. Kick all sources on an
    // interval as a rescue path — an empty take is one cheap IPC roundtrip.
    const kickAll = () => {
      const sources = sourcesRef.current;
      for (let i = 0; i < sources.length; i++) {
        drainSource(getSyntheticPaneId(paneId, i), i);
      }
    };
    kickAll();
    const kickTimer = window.setInterval(kickAll, 2000);

    return () => {
      window.clearInterval(kickTimer);
      if (flushTimer != null) {
        window.clearTimeout(flushTimer);
      }
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [paneId, addEntries]);

  // Set up pty_exit event listener for source error detection
  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();

    const setupExitListener = async () => {
      const unlisten = await appWindow.listen<{ pane_id: string; exit_code: number }>(
        'pty_exit',
        (event) => {
          const { pane_id: eventPaneId } = event.payload;

          if (!eventPaneId.startsWith(`log_${paneId}_`)) return;

          const sources = sourcesRef.current;
          const sourceIndex = sources.findIndex(
            (_, idx) => getSyntheticPaneId(paneId, idx) === eventPaneId,
          );
          if (sourceIndex === -1) return;

          const source = sources[sourceIndex];
          setSourceStatuses((prev) => {
            const next = new Map(prev);
            next.set(source.id, 'error');
            return next;
          });
          updateSourceStatus(paneId, source.id, 'error');
        },
      );
      unlistenExitRef.current = unlisten;
    };

    setupExitListener();

    return () => {
      if (unlistenExitRef.current) {
        unlistenExitRef.current();
        unlistenExitRef.current = null;
      }
    };
  }, [paneId, updateSourceStatus]);

  // Start newly added sources
  useEffect(() => {
    const sources = dashboard?.sources ?? [];
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      if (!sourceStatuses.has(source.id)) {
        // New source — start it
        setSourceStatuses((prev) => {
          const next = new Map(prev);
          next.set(source.id, 'connecting');
          return next;
        });
        startSource(paneId, source, i)
          .then(() => {
            setSourceStatuses((prev) => {
              const next = new Map(prev);
              next.set(source.id, 'running');
              return next;
            });
          })
          .catch(() => {
            setSourceStatuses((prev) => {
              const next = new Map(prev);
              next.set(source.id, 'error');
              return next;
            });
          });
      }
    }
  }, [dashboard?.sources, paneId, sourceStatuses]);

  const handleReconnect = useCallback(
    async (sourceId: string) => {
      const sources = dashboard?.sources ?? [];
      const sourceIndex = sources.findIndex((s) => s.id === sourceId);
      if (sourceIndex === -1) return;

      setSourceStatuses((prev) => {
        const next = new Map(prev);
        next.set(sourceId, 'connecting');
        return next;
      });

      try {
        await restartSource(paneId, sources[sourceIndex], sourceIndex);
        setSourceStatuses((prev) => {
          const next = new Map(prev);
          next.set(sourceId, 'running');
          return next;
        });
      } catch {
        setSourceStatuses((prev) => {
          const next = new Map(prev);
          next.set(sourceId, 'error');
          return next;
        });
      }
    },
    [paneId, dashboard?.sources],
  );

  const handleToggleExpand = useCallback(
    (id: string) => {
      toggleExpanded(paneId, id);
    },
    [paneId, toggleExpanded],
  );

  const handleAutoScrollChange = useCallback(
    (v: boolean) => {
      setAutoScroll(paneId, v);
    },
    [paneId, setAutoScroll],
  );

  // Filtering a full 100k-entry buffer is the heaviest per-render work, so it only
  // reruns when the dashboard state object changes (once per flush). While paused
  // the memo input pins to null, freezing the last computed list entirely.
  const isPaused = dashboard?.isPaused ?? false;
  const filterInput = isPaused ? null : dashboard;
  const filteredEntries = useMemo((): LogEntry[] => {
    if (!filterInput) return [];
    const allEntries = filterInput.buffer.getAll();
    const filter = filterInput.filter;
    const matched =
      !filter.regex && filter.levels.size === 0 && filter.sources.size === 0
        ? allEntries
        : allEntries.filter(buildFilterPredicate(filter));
    return matched.length > MAX_RENDERED_ENTRIES
      ? matched.slice(-MAX_RENDERED_ENTRIES)
      : matched;
  }, [filterInput]);

  // Freeze the displayed list while paused; resume shows the live list again.
  const pausedSnapshotRef = useRef<LogEntry[] | null>(null);
  if (isPaused && pausedSnapshotRef.current == null) {
    pausedSnapshotRef.current = filteredEntries;
  } else if (!isPaused && pausedSnapshotRef.current != null) {
    pausedSnapshotRef.current = null;
  }
  const displayEntries = isPaused ? (pausedSnapshotRef.current ?? filteredEntries) : filteredEntries;
  const hasSources = (dashboard?.sources.length ?? 0) > 0;

  return (
    <div className="log-dashboard" onClick={onFocus}>
      <LogToolbar
        paneId={paneId}
        workspaceId={workspaceId}
        onOpenSourcePanel={() => setShowSourcePanel(true)}
      />

      {hasSources ? (
        <LogVirtualList
          entries={displayEntries}
          expandedIds={dashboard?.expandedEntryIds ?? new Set()}
          onToggleExpand={handleToggleExpand}
          autoScroll={dashboard?.autoScroll ?? true}
          onAutoScrollChange={handleAutoScrollChange}
        />
      ) : (
        <div className="log-dashboard__empty">
          <div className="log-dashboard__empty-icon">📋</div>
          <div className="log-dashboard__empty-text">No log sources configured</div>
          <button
            className="log-dashboard__empty-btn"
            onClick={() => setShowSourcePanel(true)}
          >
            Add Source
          </button>
        </div>
      )}

      {showSourcePanel && (
        <LogSourcePanel
          paneId={paneId}
          onClose={() => setShowSourcePanel(false)}
          sourceStatuses={sourceStatuses}
          onReconnect={handleReconnect}
        />
      )}
    </div>
  );
}
