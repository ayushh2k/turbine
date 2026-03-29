import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '../state/workspaceStore';

/**
 * Hook that provides a broadcast-aware write function.
 * When broadcast mode is active, keystrokes are fanned out to all selected targets.
 * When inactive, writes only to the focused pane.
 */
export function useBroadcast(focusedPaneId: string | null) {
  const broadcastMode = useWorkspaceStore((s) => s.broadcastMode);
  const broadcastTargets = useWorkspaceStore((s) => s.broadcastTargets);

  const broadcastWrite = useCallback(
    (data: Uint8Array) => {
      if (!focusedPaneId) return;

      const dataArray = Array.from(data);

      if (broadcastMode && broadcastTargets.size > 0) {
        // Fan out to all broadcast targets + focused pane
        const targets = new Set(broadcastTargets);
        targets.add(focusedPaneId);

        // Fire all writes concurrently for minimal latency (<16ms target)
        const writes = Array.from(targets).map((paneId) =>
          invoke('pty_write', { paneId, data: dataArray }).catch(() => {}),
        );
        Promise.all(writes);
      } else {
        // Normal single-pane write
        invoke('pty_write', { paneId: focusedPaneId, data: dataArray }).catch(() => {});
      }
    },
    [focusedPaneId, broadcastMode, broadcastTargets],
  );

  const toggleBroadcast = useCallback(() => {
    const store = useWorkspaceStore.getState();
    store.setBroadcastMode(!store.broadcastMode);
  }, []);

  const toggleTarget = useCallback(
    (paneId: string) => {
      const store = useWorkspaceStore.getState();
      const targets = new Set(store.broadcastTargets);
      if (targets.has(paneId)) {
        targets.delete(paneId);
      } else {
        targets.add(paneId);
      }
      store.setBroadcastTargets(targets);
    },
    [],
  );

  const selectAllTargets = useCallback(
    (paneIds: string[]) => {
      const store = useWorkspaceStore.getState();
      store.setBroadcastTargets(new Set(paneIds));
    },
    [],
  );

  const clearTargets = useCallback(() => {
    useWorkspaceStore.getState().setBroadcastTargets(new Set());
  }, []);

  return {
    broadcastMode,
    broadcastTargets,
    broadcastWrite,
    toggleBroadcast,
    toggleTarget,
    selectAllTargets,
    clearTargets,
  };
}
