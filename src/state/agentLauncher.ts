import { invoke } from '@tauri-apps/api/core';
import type { PaneConfig } from '../types';
import { useSettingsStore } from './settingsStore';

/**
 * Launch startup commands for panes with autoLaunch enabled.
 * Executes sequentially with a configurable delay between launches.
 * Failures are reported per-pane and don't block remaining launches.
 */
export async function launchAgents(panes: PaneConfig[]): Promise<Map<string, string>> {
  const delay = useSettingsStore.getState().settings.agentLaunchDelay;
  const errors = new Map<string, string>();

  const autoLaunchPanes = panes.filter(
    (p) => p.autoLaunch && p.startupCommand,
  );

  for (let i = 0; i < autoLaunchPanes.length; i++) {
    const pane = autoLaunchPanes[i];

    try {
      // Write the startup command to the PTY (assumes PTY is already spawned)
      const encoder = new TextEncoder();
      const command = pane.startupCommand + '\n';
      await invoke('pty_write', {
        paneId: pane.id,
        data: Array.from(encoder.encode(command)),
      });
    } catch (err) {
      errors.set(pane.id, String(err));
    }

    // Delay between launches (skip after the last one)
    if (i < autoLaunchPanes.length - 1 && delay > 0) {
      await sleep(delay);
    }
  }

  return errors;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
