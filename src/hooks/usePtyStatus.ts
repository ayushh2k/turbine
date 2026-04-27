import { useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { create } from 'zustand';
import { useSettingsStore } from '../state/settingsStore';
import { useWorkspaceStore } from '../state/workspaceStore';
import { useTaskStore } from '../state/taskStore';
import { useNotificationStore } from '../state/notificationStore';
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
  /** Timestamp (ms) when each pane was last set to 'running'. Used to ignore stale pty_exit events. */
  spawnTimestamps: Map<string, number>;
  setStatus: (paneId: string, status: PaneProcessStatus, exitCode: number | null) => void;
  removeStatus: (paneId: string) => void;
  setPaneSize: (paneId: string, cols: number, rows: number) => void;
  removePaneSize: (paneId: string) => void;
}

const DEFAULT_ENTRY: PaneStatusEntry = { status: 'running', exitCode: null };

/** Grace period (ms) after spawning during which stale pty_exit events are ignored. */
const SPAWN_GRACE_MS = 3000;

export const usePtyStatusStore = create<PtyStatusState>((set) => ({
  statuses: new Map(),
  paneSizes: new Map(),
  spawnTimestamps: new Map(),

  setStatus: (paneId, status, exitCode) => {
    set((state) => {
      const existing = state.statuses.get(paneId);
      if (existing && existing.status === status && existing.exitCode === exitCode) {
        return state;
      }
      const next = new Map(state.statuses);
      next.set(paneId, { status, exitCode });
      // Track when a pane transitions to 'running' (i.e. a new session was spawned)
      if (status === 'running') {
        const ts = new Map(state.spawnTimestamps);
        ts.set(paneId, Date.now());
        return { statuses: next, spawnTimestamps: ts };
      }
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

    const appWindow = getCurrentWebviewWindow();
    appWindow.listen<{ pane_id: string; exit_code: number | null }>('pty_exit', (event) => {
      const { pane_id, exit_code } = event.payload;
      // Ignore stale exit events that arrive shortly after a pane was (re)spawned.
      // This handles the React StrictMode double-mount and kill/respawn race conditions.
      const spawnTs = usePtyStatusStore.getState().spawnTimestamps.get(pane_id);
      if (spawnTs && Date.now() - spawnTs < SPAWN_GRACE_MS) {
        return;
      }
      const status: PaneProcessStatus =
        exit_code === null || exit_code !== 0 ? 'errored' : 'exited';
      setStatus(pane_id, status, exit_code);

      // Notify only when a process exits with a non-zero code in a non-focused pane.
      // Clean exits (code 0) are expected and don't need a toast — they'd spam the user
      // when closing workspaces, splitting panes, or running quick commands.
      // Also skip notifications for panes that no longer exist in any workspace
      // (layout template changes replace all panes, causing mass PTY kills).
      if (exit_code !== null && exit_code !== 0) {
        const ws = useWorkspaceStore.getState();
        let paneLabel: string | null = null;
        for (const workspace of ws.workspaces) {
          const pane = workspace.panes.find((p) => p.id === pane_id);
          if (pane) {
            paneLabel = pane.title || pane.label || pane.id;
            break;
          }
        }

        // Pane no longer exists — it was removed by a layout change, not a real failure
        if (paneLabel === null) return;

        const focusedElement = document.activeElement;
        const paneContainer = document.querySelector(`[data-pane-id="${pane_id}"]`);
        const isFocused = paneContainer != null && paneContainer.contains(focusedElement);

        if (!isFocused) {
          useNotificationStore.getState().addNotification(
            'Process failed',
            `${paneLabel} (exit code: ${exit_code})`,
            'warning',
          );
        }
      }

      // Auto-move linked task to "done" on successful exit
      if (exit_code === 0) {
        const ws = useWorkspaceStore.getState();
        for (const workspace of ws.workspaces) {
          const pane = workspace.panes.find((p) => p.id === pane_id);
          if (pane?.taskId) {
            const task = useTaskStore.getState().tasks.find((t) => t.id === pane.taskId);
            if (task && task.status !== 'done') {
              void useTaskStore.getState().updateTask({ ...task, status: 'done' });
            }
            break;
          }
        }
      }
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
