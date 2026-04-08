import { invoke } from '@tauri-apps/api/core';

interface SpawnPaneSessionOptions {
  paneId: string;
  cwd?: string;
  env?: Record<string, string>;
  shell?: string | null;
  startupCommand?: string | null;
  runStartupCommand?: boolean;
  cols?: number;
  rows?: number;
}

const MIN_TERMINAL_DIMENSION = 2;
const DEFAULT_TERMINAL_COLS = 80;
const DEFAULT_TERMINAL_ROWS = 24;

function normalizeDimension(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(MIN_TERMINAL_DIMENSION, Math.floor(value ?? fallback));
}

export async function spawnPaneSession({
  paneId,
  cwd = '.',
  env = {},
  shell = null,
  startupCommand = null,
  runStartupCommand = false,
  cols,
  rows,
}: SpawnPaneSessionOptions): Promise<void> {
  const wasSpawned = await invoke<boolean>('pty_spawn', {
    paneId,
    cwd,
    env,
    shell,
    cols: normalizeDimension(cols, DEFAULT_TERMINAL_COLS),
    rows: normalizeDimension(rows, DEFAULT_TERMINAL_ROWS),
  });

  // Only send startup command on a fresh spawn (not on remounts where PTY already exists)
  if (!wasSpawned || !runStartupCommand || !startupCommand) {
    return;
  }

  const encoder = new TextEncoder();
  await invoke('pty_write', {
    paneId,
    data: Array.from(encoder.encode(`${startupCommand}\n`)),
  });
}
