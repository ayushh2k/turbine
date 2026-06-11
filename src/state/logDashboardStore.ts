import { create } from 'zustand';
import type {
  LogEntry,
  LogSourceConfig,
  FilterState,
  SourceStatus,
  DashboardPaneState,
  LogLevel,
} from '../types';
import { RingBuffer } from '../utils/ringBuffer';

/** Default buffer capacity: 100,000 log entries per pane */
const BUFFER_CAPACITY = 100_000;

/** Maximum number of concurrent log sources per pane */
const MAX_SOURCES = 20;

/**
 * Internal pane state that extends the public DashboardPaneState type
 * with the ring buffer (not serializable, so kept out of the shared type).
 */
export interface InternalDashboardPaneState extends DashboardPaneState {
  buffer: RingBuffer<LogEntry>;
}

interface LogDashboardStoreState {
  dashboards: Map<string, InternalDashboardPaneState>;

  // Actions
  initDashboard: (paneId: string) => void;
  destroyDashboard: (paneId: string) => void;
  addEntries: (paneId: string, entries: LogEntry[]) => void;
  setFilter: (paneId: string, filter: Partial<FilterState>) => void;
  setPaused: (paneId: string, paused: boolean) => void;
  addSource: (paneId: string, source: LogSourceConfig) => boolean;
  removeSource: (paneId: string, sourceId: string) => void;
  updateSourceStatus: (paneId: string, sourceId: string, status: SourceStatus) => void;
  toggleExpanded: (paneId: string, entryId: string) => void;
  setAutoScroll: (paneId: string, autoScroll: boolean) => void;
}

function createDefaultPaneState(): InternalDashboardPaneState {
  return {
    sources: [],
    buffer: new RingBuffer<LogEntry>(BUFFER_CAPACITY),
    filter: {
      regex: null,
      levels: new Set<LogLevel>(),
      sources: new Set<string>(),
    },
    isPaused: false,
    pausedEntryCount: 0,
    autoScroll: true,
    expandedEntryIds: new Set<string>(),
  };
}

export const useLogDashboardStore = create<LogDashboardStoreState>((set, get) => ({
  dashboards: new Map<string, InternalDashboardPaneState>(),

  initDashboard: (paneId: string) => {
    set((state) => {
      const dashboards = new Map(state.dashboards);
      if (!dashboards.has(paneId)) {
        dashboards.set(paneId, createDefaultPaneState());
      }
      return { dashboards };
    });
  },

  destroyDashboard: (paneId: string) => {
    set((state) => {
      const dashboards = new Map(state.dashboards);
      dashboards.delete(paneId);
      return { dashboards };
    });
  },

  addEntries: (paneId: string, entries: LogEntry[]) => {
    if (entries.length === 0) return;
    set((state) => {
      const dashboards = new Map(state.dashboards);
      const pane = dashboards.get(paneId);
      if (!pane) return state;

      // Push entries to ring buffer (always buffer, even when paused)
      for (const entry of entries) {
        pane.buffer.push(entry);
      }

      const pausedEntryCount = pane.isPaused
        ? pane.pausedEntryCount + entries.length
        : pane.pausedEntryCount;

      dashboards.set(paneId, {
        ...pane,
        pausedEntryCount,
      });

      return { dashboards };
    });
  },

  setFilter: (paneId: string, filter: Partial<FilterState>) => {
    set((state) => {
      const dashboards = new Map(state.dashboards);
      const pane = dashboards.get(paneId);
      if (!pane) return state;

      dashboards.set(paneId, {
        ...pane,
        filter: {
          ...pane.filter,
          ...filter,
        },
      });

      return { dashboards };
    });
  },

  setPaused: (paneId: string, paused: boolean) => {
    set((state) => {
      const dashboards = new Map(state.dashboards);
      const pane = dashboards.get(paneId);
      if (!pane) return state;

      dashboards.set(paneId, {
        ...pane,
        isPaused: paused,
        // Reset pausedEntryCount when resuming
        pausedEntryCount: paused ? pane.pausedEntryCount : 0,
      });

      return { dashboards };
    });
  },

  addSource: (paneId: string, source: LogSourceConfig): boolean => {
    const state = get();
    const pane = state.dashboards.get(paneId);
    if (!pane) return false;

    // Enforce max 20 sources limit
    if (pane.sources.length >= MAX_SOURCES) {
      return false;
    }

    set((state) => {
      const dashboards = new Map(state.dashboards);
      const currentPane = dashboards.get(paneId);
      if (!currentPane) return state;

      // Double-check limit in case of race
      if (currentPane.sources.length >= MAX_SOURCES) {
        return state;
      }

      dashboards.set(paneId, {
        ...currentPane,
        sources: [...currentPane.sources, source],
      });

      return { dashboards };
    });

    return true;
  },

  removeSource: (paneId: string, sourceId: string) => {
    set((state) => {
      const dashboards = new Map(state.dashboards);
      const pane = dashboards.get(paneId);
      if (!pane) return state;

      dashboards.set(paneId, {
        ...pane,
        sources: pane.sources.filter((s) => s.id !== sourceId),
      });

      return { dashboards };
    });
  },

  updateSourceStatus: (paneId: string, _sourceId: string, _status: SourceStatus) => {
    // Source status is tracked externally (LogStreamManager handles SourceStatusEntry).
    // This action is a hook for the store to react to status changes if needed.
    // For now, we trigger a re-render by touching the dashboards map.
    set((state) => {
      const dashboards = new Map(state.dashboards);
      const pane = dashboards.get(paneId);
      if (!pane) return state;

      // Clone to trigger re-render for consumers watching this pane
      dashboards.set(paneId, { ...pane });
      return { dashboards };
    });
  },

  toggleExpanded: (paneId: string, entryId: string) => {
    set((state) => {
      const dashboards = new Map(state.dashboards);
      const pane = dashboards.get(paneId);
      if (!pane) return state;

      const expandedEntryIds = new Set(pane.expandedEntryIds);
      if (expandedEntryIds.has(entryId)) {
        expandedEntryIds.delete(entryId);
      } else {
        expandedEntryIds.add(entryId);
      }

      dashboards.set(paneId, {
        ...pane,
        expandedEntryIds,
      });

      return { dashboards };
    });
  },

  setAutoScroll: (paneId: string, autoScroll: boolean) => {
    set((state) => {
      const dashboards = new Map(state.dashboards);
      const pane = dashboards.get(paneId);
      if (!pane) return state;

      dashboards.set(paneId, {
        ...pane,
        autoScroll,
      });

      return { dashboards };
    });
  },
}));
