import type { PaneConfig, Workspace } from '../types';

function getParentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const slashIndex = normalized.lastIndexOf('/');

  if (slashIndex <= 0) {
    return normalized;
  }

  return normalized.slice(0, slashIndex);
}

function getPanePath(pane: PaneConfig): string | null {
  if (!pane.workingDirectory) {
    return null;
  }

  if (pane.type === 'code_viewer') {
    return getParentPath(pane.workingDirectory);
  }

  return pane.workingDirectory;
}

export function deriveWorkspaceRoot(
  workspace: Workspace | undefined,
  focusedPaneId: string | null,
): string | null {
  if (!workspace) {
    return null;
  }

  const focusedPane = workspace.panes.find((pane) => pane.id === focusedPaneId);
  const focusedRoot = focusedPane ? getPanePath(focusedPane) : null;
  if (focusedRoot) {
    return focusedRoot;
  }

  for (const pane of workspace.panes) {
    const root = getPanePath(pane);
    if (root) {
      return root;
    }
  }

  return null;
}
