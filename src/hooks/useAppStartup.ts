import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '../state/workspaceStore';
import { useSettingsStore } from '../state/settingsStore';
import { launchAgents } from '../state/agentLauncher';
import { applyTheme, loadPersistedThemes } from '../themes/themeEngine';

export function useAppStartup(createWorkspace: (name?: string) => unknown) {
  const [loading, setLoading] = useState(true);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const restoreAll = useWorkspaceStore((s) => s.restoreAll);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      await loadSettings();
      await loadPersistedThemes().catch(() => {});
      await restoreAll();

      if (cancelled) {
        return;
      }

      const workspaceState = useWorkspaceStore.getState();
      const cliArgs = await invoke<string[]>('get_cli_args').catch(() => []);
      
      if (workspaceState.workspaces.length === 0) {
        const ws = createWorkspace('Workspace 1') as unknown as { id: string }; // We know it returns Workspace but types here use unknown
        if (cliArgs.length > 1 && cliArgs[1]) {
          const initialDir = cliArgs[1];
          useWorkspaceStore.setState((s) => ({
            workspaces: s.workspaces.map((w) =>
              w.id === ws.id ? { ...w, panes: w.panes.map((p) => ({ ...p, workingDirectory: initialDir })) } : w
            ),
          }));
        }
      } else if (cliArgs.length > 1 && cliArgs[1] && !cliArgs[1].includes('tauri-dev')) {
        // App launched via CLI with a specific directory (not just the vite dev server arg)
        // Let's create a new workspace tab for it
        const initialDir = cliArgs[1];
        const wsName = initialDir.split(/[/\\]/).pop() || 'CLI Run';
        const ws = createWorkspace(wsName) as unknown as { id: string };
        useWorkspaceStore.setState((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === ws.id ? { ...w, panes: w.panes.map((p) => ({ ...p, workingDirectory: initialDir })) } : w
          ),
          activeWorkspaceId: ws.id,
        }));
      }

      applyTheme(useSettingsStore.getState().settings.theme);

      const refreshedState = useWorkspaceStore.getState();
      const activeWorkspace =
        refreshedState.workspaces.find((workspace) => workspace.id === refreshedState.activeWorkspaceId) ??
        refreshedState.workspaces[0];

      if (activeWorkspace) {
        const errors = await launchAgents(activeWorkspace.panes);
        if (errors.size > 0) {
          console.warn('Agent launch errors:', Object.fromEntries(errors));
        }
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [createWorkspace, loadSettings, restoreAll]);

  return loading;
}
