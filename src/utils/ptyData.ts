import { invoke } from '@tauri-apps/api/core';

/**
 * Drains pending output bytes for a pane. PTY data travels over the raw-byte
 * invoke response path instead of Tauri events: event payloads are injected as
 * JSON literals inside evaluateJavaScript source strings, which forces WebKit
 * to parse megabytes of script per second under output floods. The backend
 * emits a tiny `pty_data_ready { pane_id }` signal; consumers call this to pull.
 */
export async function takePtyOutput(paneId: string): Promise<Uint8Array> {
  const data = await invoke<ArrayBuffer>('pty_take_output', { paneId });
  return new Uint8Array(data);
}

const drainingPanes = new Set<string>();

/**
 * Pulls a pane's output until its buffer runs dry, invoking `onBytes` per take.
 * Paced to ~30 takes/s: an unthrottled pull loop spins hundreds of raw-byte IPC
 * roundtrips per second, and the per-response buffers churn WebKit's C++ heap
 * hard enough to peg the content process. 30Hz × 4MB buffer ≫ any PTY's output
 * rate, while the Rust side blocks the child when the buffer fills.
 * Re-entrant calls for a pane already draining return immediately.
 */
export async function drainPtyOutput(
  paneId: string,
  onBytes: (bytes: Uint8Array) => void | Promise<void>,
  paceMs = 33,
): Promise<void> {
  if (drainingPanes.has(paneId)) return;
  drainingPanes.add(paneId);
  try {
    let bytes = await takePtyOutput(paneId);
    while (bytes.length > 0) {
      await onBytes(bytes);
      await new Promise((r) => setTimeout(r, paceMs));
      bytes = await takePtyOutput(paneId);
    }
  } catch {
    // PTY gone — pty_exit handles cleanup.
  } finally {
    drainingPanes.delete(paneId);
  }
}
