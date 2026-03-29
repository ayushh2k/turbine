import { useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '../state/workspaceStore';

/**
 * Hook that provides a broadcast-aware write function.
 * When broadcast mode is active, keystrokes are fanned out to every terminal pane
 * in the active workspace.
 * When inactive, writes only to the focused pane.
 */
export function useBroadcast(focusedPaneId: string | null, targetPaneIds: string[]) {
  const broadcastMode = useWorkspaceStore((s) => s.broadcastMode);
  const broadcastTargets = useWorkspaceStore((s) => s.broadcastTargets);

  useEffect(() => {
    if (!broadcastMode) {
      return;
    }

    const nextTargets = new Set(
      targetPaneIds.filter((paneId) => paneId !== focusedPaneId),
    );

    const hasSameTargets =
      broadcastTargets.size === nextTargets.size &&
      Array.from(nextTargets).every((paneId) => broadcastTargets.has(paneId));

    if (!hasSameTargets) {
      useWorkspaceStore.getState().setBroadcastTargets(nextTargets);
    }
  }, [broadcastMode, broadcastTargets, focusedPaneId, targetPaneIds]);

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
    store.setBroadcastTargets(
      nextMode
        ? new Set(targetPaneIds.filter((paneId) => paneId !== focusedPaneId))
        : new Set(),
    );
  }, [focusedPaneId, targetPaneIds]);

  return {
    broadcastMode,
    broadcastWrite,
    toggleBroadcast,
  };
}
