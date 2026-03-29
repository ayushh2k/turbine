import { useEffect, useState } from 'react';
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
      if (workspaceState.workspaces.length === 0) {
        createWorkspace('Workspace 1');
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
