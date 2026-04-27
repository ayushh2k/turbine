import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '../state/workspaceStore';

/**
 * Hook that provides a broadcast-aware write function.
 * When broadcast mode is active, keystrokes are fanned out to every targeted terminal pane
 * in the active workspace.
 * When inactive, writes only to the focused pane.
 */
export function useBroadcast(focusedPaneId: string | null, targetPaneIds: string[]) {
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
    const nextMode = !store.broadcastMode;
    store.setBroadcastMode(nextMode);

    if (nextMode) {
      // When first activating, default to all terminal panes selected (except focused)
      store.setBroadcastTargets(
        new Set(targetPaneIds.filter((paneId) => paneId !== focusedPaneId)),
      );
    }
    // When deactivating, leave targets as-is so they're remembered for next activation
  }, [focusedPaneId, targetPaneIds]);

  return {
    broadcastMode,
    broadcastWrite,
    toggleBroadcast,
  };
}
