import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { LogSourceConfig, SourceStatus, LogEntry } from '../../../types';
import { useLogDashboardStore } from '../../../state/logDashboardStore';
import { parseLine } from '../../../utils/logParser';
import { matchesFilter } from '../../../utils/filterEngine';
import { startSource, stopAllSources, restartSource, getSyntheticPaneId } from '../../../utils/logStreamManager';
import { LogToolbar } from './LogToolbar';
import { LogSourcePanel } from './LogSourcePanel';
import { LogVirtualList } from './LogVirtualList';
import './LogDashboard.css';

interface LogDashboardPaneProps {
  paneId: string;
  workspaceId: string;
  onFocus: () => void;
}

export function LogDashboardPane({ paneId, workspaceId, onFocus }: LogDashboardPaneProps) {
  const initDashboard = useLogDashboardStore((s) => s.initDashboard);
  const destroyDashboard = useLogDashboardStore((s) => s.destroyDashboard);
  const addEntry = useLogDashboardStore((s) => s.addEntry);
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
    invoke<LogSourceConfig[]>('load_log_sources', { paneId })
      .then(async (savedSources) => {
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

  // Set up pty_output event listener
  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();

    const setupListener = async () => {
      const unlisten = await appWindow.listen<{ pane_id: string; data: number[] }>(
        'pty_output',
        (event) => {
          const { pane_id: eventPaneId, data } = event.payload;

          // Check if this event is for one of our synthetic pane IDs
          if (!eventPaneId.startsWith(`log_${paneId}_`)) return;

          // Find which source this belongs to
          const sources = sourcesRef.current;
          const sourceIndex = sources.findIndex(
            (_, idx) => getSyntheticPaneId(paneId, idx) === eventPaneId,
          );
          if (sourceIndex === -1) return;

          const source = sources[sourceIndex];
          const text = new TextDecoder().decode(new Uint8Array(data));

          // Split by newlines and parse each line
          const lines = text.split('\n').filter((line) => line.trim().length > 0);
          for (const line of lines) {
            const entry = parseLine(
              line,
              source.id,
              source.displayName,
              source.color ?? '#00e5c8',
            );
            addEntry(paneId, entry);
          }
        },
      );
      unlistenRef.current = unlisten;
    };

    setupListener();

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [paneId, addEntry]);

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

  // Get filtered entries
  const getFilteredEntries = (): LogEntry[] => {
    if (!dashboard) return [];
    const allEntries = dashboard.buffer.getAll();
    const filter = dashboard.filter;

    // If paused, don't show new entries (show up to the point of pause)
    // Actually, the buffer always has all entries; paused just means we don't auto-scroll
    // Filter entries based on current filter state
    if (!filter.regex && filter.levels.size === 0 && filter.sources.size === 0) {
      return allEntries;
    }
    return allEntries.filter((entry) => matchesFilter(entry, filter));
  };

  const filteredEntries = getFilteredEntries();
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
          entries={filteredEntries}
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
