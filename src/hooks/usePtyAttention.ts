import { useEffect } from 'react';
import { type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { useWorkspaceStore } from '../state/workspaceStore';

/** Per-pane suppression window — one notification per this many ms. */
const PER_PANE_THROTTLE_MS = 5000;

let permissionChecked = false;
let permissionGranted = false;

async function ensurePermission(): Promise<boolean> {
  if (permissionChecked) return permissionGranted;
  try {
    permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const result = await requestPermission();
      permissionGranted = result === 'granted';
    }
  } catch {
    permissionGranted = false;
  }
  permissionChecked = true;
  return permissionGranted;
}

function getPaneInfo(paneId: string): { workspaceName: string; paneLabel: string } | null {
  const { workspaces } = useWorkspaceStore.getState();
  for (const ws of workspaces) {
    const pane = ws.panes.find((p) => p.id === paneId);
    if (pane) {
      return {
        workspaceName: ws.name,
        paneLabel: pane.title || pane.label || pane.type,
      };
    }
  }
  return null;
}

/**
 * Listens for `pty_attention` events emitted when a PTY writes a BEL (\x07),
 * which CLI agents use to signal "I'm waiting on you". Fires a native system
 * notification when the relevant pane is not currently visible/focused.
 */
export function usePtyAttentionListener(focusedPaneId: string | null) {
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;
    const lastFired = new Map<string, number>();

    const appWindow = getCurrentWebviewWindow();
    appWindow
      .listen<{ pane_id: string }>('pty_attention', async (event) => {
        const { pane_id } = event.payload;

        // Suppress if the pane is currently focused AND the window is focused.
        let windowFocused = false;
        try {
          windowFocused = await appWindow.isFocused();
        } catch {
          windowFocused = false;
        }
        if (windowFocused && pane_id === focusedPaneId) return;

        // Per-pane throttle on top of the Rust-side throttle.
        const now = Date.now();
        const last = lastFired.get(pane_id) ?? 0;
        if (now - last < PER_PANE_THROTTLE_MS) return;
        lastFired.set(pane_id, now);

        const info = getPaneInfo(pane_id);
        if (!info) return;

        const granted = await ensurePermission();
        if (!granted) return;

        sendNotification({
          title: `${info.paneLabel} is waiting`,
          body: `${info.workspaceName} — needs your input`,
        });
      })
      .then((fn) => {
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
  }, [focusedPaneId]);
}
