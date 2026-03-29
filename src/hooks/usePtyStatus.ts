import { useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { create } from 'zustand';

export type PaneProcessStatus = 'running' | 'exited' | 'errored';

interface PaneStatusEntry {
  status: PaneProcessStatus;
  exitCode: number | null;
}

interface PtyStatusState {
  statuses: Map<string, PaneStatusEntry>;
  setStatus: (paneId: string, status: PaneProcessStatus, exitCode: number | null) => void;
  removeStatus: (paneId: string) => void;
}

const DEFAULT_ENTRY: PaneStatusEntry = { status: 'running', exitCode: null };

export const usePtyStatusStore = create<PtyStatusState>((set) => ({
  statuses: new Map(),

  setStatus: (paneId, status, exitCode) => {
    set((state) => {
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
}));

/**
 * Listens for `pty_exit` events and maintains per-pane process status.
 * Call once at the app level.
 */
export function usePtyStatusListener() {
  const setStatus = usePtyStatusStore((s) => s.setStatus);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<{ pane_id: string; exit_code: number | null }>('pty_exit', (event) => {
      const { pane_id, exit_code } = event.payload;
      const status: PaneProcessStatus =
        exit_code === null || exit_code !== 0 ? 'errored' : 'exited';
      setStatus(pane_id, status, exit_code);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
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
  shell?: string | null;
}) {
  const entry = usePtyStatusStore((s) => s.statuses.get(paneId) ?? DEFAULT_ENTRY);
  const setStatus = usePtyStatusStore((s) => s.setStatus);

  const restartPane = useCallback(async () => {
    await invoke('pty_kill', { paneId }).catch(() => {});
    setStatus(paneId, 'running', null);
    await invoke('pty_spawn', {
      paneId,
      cwd: paneConfig?.cwd ?? '.',
      env: paneConfig?.env ?? {},
      shell: paneConfig?.shell ?? null,
    });
  }, [paneId, paneConfig?.cwd, paneConfig?.env, paneConfig?.shell, setStatus]);

  return {
    status: entry.status,
    exitCode: entry.exitCode,
    restartPane,
  };
}
