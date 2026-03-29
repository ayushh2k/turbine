import { useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { create } from 'zustand';
import { useSettingsStore } from '../state/settingsStore';
import { spawnPaneSession } from '../state/terminalSession';

export type PaneProcessStatus = 'running' | 'exited' | 'errored';

interface PaneStatusEntry {
  status: PaneProcessStatus;
  exitCode: number | null;
}

interface PaneSize {
  cols: number;
  rows: number;
}

interface PtyStatusState {
  statuses: Map<string, PaneStatusEntry>;
  paneSizes: Map<string, PaneSize>;
  setStatus: (paneId: string, status: PaneProcessStatus, exitCode: number | null) => void;
  removeStatus: (paneId: string) => void;
  setPaneSize: (paneId: string, cols: number, rows: number) => void;
  removePaneSize: (paneId: string) => void;
}

const DEFAULT_ENTRY: PaneStatusEntry = { status: 'running', exitCode: null };

export const usePtyStatusStore = create<PtyStatusState>((set) => ({
  statuses: new Map(),
  paneSizes: new Map(),

  setStatus: (paneId, status, exitCode) => {
    set((state) => {
      const existing = state.statuses.get(paneId);
      if (existing && existing.status === status && existing.exitCode === exitCode) {
        return state;
      }
      const next = new Map(state.statuses);
      next.set(paneId, { status, exitCode });
      return { statuses: next };
    });
  },

  removeStatus: (paneId) => {
    set((state) => {
      const next = new Map(state.statuses);
      next.delete(paneId);
      return { statuses: next };
    });
  },

  setPaneSize: (paneId, cols, rows) => {
    set((state) => {
      const existing = state.paneSizes.get(paneId);
      if (existing && existing.cols === cols && existing.rows === rows) {
        return state;
      }
      const next = new Map(state.paneSizes);
      next.set(paneId, { cols, rows });
      return { paneSizes: next };
    });
  },

  removePaneSize: (paneId) => {
    set((state) => {
      const next = new Map(state.paneSizes);
      next.delete(paneId);
      return { paneSizes: next };
    });
  },
}));

/**
 * Listens for `pty_exit` events and maintains per-pane process status.
 * Call once at the app level.
 */
export function usePtyStatusListener() {
  const setStatus = usePtyStatusStore((s) => s.setStatus);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    listen<{ pane_id: string; exit_code: number | null }>('pty_exit', (event) => {
      const { pane_id, exit_code } = event.payload;
      const status: PaneProcessStatus =
        exit_code === null || exit_code !== 0 ? 'errored' : 'exited';
      setStatus(pane_id, status, exit_code);
    }).then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [setStatus]);
}

/**
 * Returns the process status for a given pane, plus a restart function.
 */
export function usePaneStatus(paneId: string, paneConfig?: {
  cwd?: string;
  env?: Record<string, string>;
  startupCommand?: string | null;
}) {
  const entry = usePtyStatusStore((s) => s.statuses.get(paneId) ?? DEFAULT_ENTRY);
  const paneSize = usePtyStatusStore((s) => s.paneSizes.get(paneId));
  const setStatus = usePtyStatusStore((s) => s.setStatus);
  const defaultShell = useSettingsStore((s) => s.settings.defaultShell);

  const restartPane = useCallback(async () => {
    try {
      await invoke('pty_kill', { paneId }).catch(() => {});
      setStatus(paneId, 'running', null);
      await spawnPaneSession({
        paneId,
        cwd: paneConfig?.cwd ?? '.',
        env: paneConfig?.env ?? {},
        shell: defaultShell,
        startupCommand: paneConfig?.startupCommand ?? null,
        runStartupCommand: Boolean(paneConfig?.startupCommand),
        cols: paneSize?.cols,
        rows: paneSize?.rows,
      });
    } catch (error) {
      setStatus(paneId, 'errored', null);
      console.error(`Failed to restart pane ${paneId}:`, error);
    }
  }, [paneId, paneConfig?.cwd, paneConfig?.env, paneConfig?.startupCommand, defaultShell, paneSize?.cols, paneSize?.rows, setStatus]);

  return {
    status: entry.status,
    exitCode: entry.exitCode,
    restartPane,
  };
}
