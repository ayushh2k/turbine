import { open } from '@tauri-apps/plugin-dialog';
import { useWorkspaceStore } from '../state/workspaceStore';

/**
 * Opens a native folder picker, then creates a new workspace
 * with a terminal pane rooted at that folder. The workspace
 * name is derived from the folder name.
 *
 * Returns the workspace id, or null if the user cancelled.
 */
export async function openWorkspaceFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Open Workspace Folder',
  });

  if (!selected) return null;

  const folderPath = selected as string;
  const folderName = folderPath.split('/').filter(Boolean).pop() ?? folderPath;

  const workspace = useWorkspaceStore.getState().createWorkspace(folderName);

  // Update panes to use the selected folder as working directory and set type to terminal
  useWorkspaceStore.setState((s) => ({
    workspaces: s.workspaces.map((w) =>
      w.id === workspace.id
        ? {
            ...w,
            panes: w.panes.map((p) => ({
              ...p,
              type: 'terminal' as const,
              workingDirectory: folderPath,
            })),
          }
        : w,
    ),
  }));

  return workspace.id;
}
