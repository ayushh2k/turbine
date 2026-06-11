import { invoke } from '@tauri-apps/api/core';
import type {
  LogSourceConfig,
  LogSourceType,
  LogSourceParams,
  LocalFileParams,
  DockerContainerParams,
  SshRemoteParams,
  KubernetesPodParams,
  SystemdJournalParams,
  CustomCommandParams,
} from '../types';

/** Wire shape of a log source as the Rust backend stores it (snake_case, params as JSON string). */
export interface RustLogSourceConfig {
  id: string;
  pane_id: string;
  source_type: string;
  display_name: string;
  color: string | null;
  params_json: string;
  sort_order: number;
}

export function toRustLogSource(source: LogSourceConfig): RustLogSourceConfig {
  return {
    id: source.id,
    pane_id: source.paneId,
    source_type: source.sourceType,
    display_name: source.displayName,
    color: source.color,
    params_json: JSON.stringify(source.params),
    sort_order: source.sortOrder,
  };
}

export function fromRustLogSource(row: RustLogSourceConfig): LogSourceConfig {
  let params: LogSourceParams;
  try {
    params = JSON.parse(row.params_json) as LogSourceParams;
  } catch {
    params = {} as LogSourceParams;
  }
  return {
    id: row.id,
    paneId: row.pane_id,
    sourceType: row.source_type as LogSourceType,
    displayName: row.display_name,
    color: row.color,
    params,
    sortOrder: row.sort_order,
  };
}

/**
 * Generates the shell command string for a given log source configuration.
 * Each source type maps to a specific command with its required and optional parameters.
 */
export function generateCommand(source: LogSourceConfig): string {
  switch (source.sourceType) {
    case 'local_file': {
      const params = source.params as LocalFileParams;
      return `tail -f ${params.filePath}`;
    }

    case 'docker_container': {
      const params = source.params as DockerContainerParams;
      // Default --tail: without it docker dumps the container's entire log
      // history at full speed, which floods the event pipeline.
      const parts = ['docker', 'logs', '-f', '--tail', String(params.tail ?? 1000)];
      parts.push(params.containerNameOrId);
      return parts.join(' ');
    }

    case 'ssh_remote': {
      const params = source.params as SshRemoteParams;
      const parts = ['ssh'];
      const user = params.user ?? '$(whoami)';
      parts.push(`${user}@${params.host}`);
      if (params.port != null) {
        parts.push('-p', String(params.port));
      }
      if (params.identityFile != null) {
        parts.push('-i', params.identityFile);
      }
      parts.push(`"tail -f ${params.remoteFilePath}"`);
      return parts.join(' ');
    }

    case 'kubernetes_pod': {
      const params = source.params as KubernetesPodParams;
      const parts = ['kubectl', 'logs', '-f', params.podName];
      if (params.namespace != null) {
        parts.push('-n', params.namespace);
      }
      if (params.containerName != null) {
        parts.push('-c', params.containerName);
      }
      parts.push(`--tail=${params.tail ?? 1000}`);
      return parts.join(' ');
    }

    case 'systemd_journal': {
      const params = source.params as SystemdJournalParams;
      const parts = ['journalctl', '-f', '-u', params.unitName];
      if (params.lines != null) {
        parts.push(`--lines=${params.lines}`);
      }
      return parts.join(' ');
    }

    case 'custom_command': {
      const params = source.params as CustomCommandParams;
      return params.command;
    }

    default: {
      const _exhaustive: never = source.sourceType;
      throw new Error(`Unknown source type: ${_exhaustive}`);
    }
  }
}

/**
 * Generates the synthetic pane ID used to identify a log source's PTY process.
 * Format: `log_{dashboardPaneId}_{sourceIndex}`
 */
export function getSyntheticPaneId(dashboardPaneId: string, sourceIndex: number): string {
  return `log_${dashboardPaneId}_${sourceIndex}`;
}

/**
 * Starts a log source by spawning a PTY process and writing the generated command to it.
 * Returns the synthetic pane ID used to identify this source's PTY.
 */
export async function startSource(
  dashboardPaneId: string,
  source: LogSourceConfig,
  sourceIndex: number
): Promise<string> {
  const syntheticPaneId = getSyntheticPaneId(dashboardPaneId, sourceIndex);
  const command = generateCommand(source);

  // Spawn an interactive shell PTY for this log source
  await invoke<boolean>('pty_spawn', {
    paneId: syntheticPaneId,
    cwd: null,
    env: null,
    shell: null,
    cols: 80,
    rows: 24,
  });

  // Write the generated command to the PTY to start streaming logs
  const encoder = new TextEncoder();
  await invoke('pty_write', {
    paneId: syntheticPaneId,
    data: Array.from(encoder.encode(`${command}\n`)),
  });

  return syntheticPaneId;
}

/**
 * Stops a log source by killing its PTY process.
 */
export async function stopSource(syntheticPaneId: string): Promise<void> {
  await invoke('pty_kill', { paneId: syntheticPaneId });
}

/**
 * Stops all log sources for a given dashboard pane by killing all associated PTY processes.
 */
export async function stopAllSources(dashboardPaneId: string, sourceCount: number): Promise<void> {
  const killPromises: Promise<unknown>[] = [];
  for (let i = 0; i < sourceCount; i++) {
    const syntheticPaneId = getSyntheticPaneId(dashboardPaneId, i);
    killPromises.push(invoke('pty_kill', { paneId: syntheticPaneId }).catch(() => {}));
  }
  await Promise.all(killPromises);
}

/**
 * Restarts a log source by stopping and then starting it again.
 * Returns the synthetic pane ID.
 */
export async function restartSource(
  dashboardPaneId: string,
  source: LogSourceConfig,
  sourceIndex: number
): Promise<string> {
  const syntheticPaneId = getSyntheticPaneId(dashboardPaneId, sourceIndex);
  await stopSource(syntheticPaneId).catch(() => {});
  return startSource(dashboardPaneId, source, sourceIndex);
}
