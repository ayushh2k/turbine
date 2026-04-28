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
  if (!pane.workingDirectory || pane.workingDirectory === '.') {
    return null;
  }

  if (pane.type === 'code_viewer' || pane.type === 'media_viewer') {
    return getParentPath(pane.workingDirectory);
  }

  return pane.workingDirectory;
}

/**
 * Derives a stable root path for a workspace. The result must NOT depend on which pane
 * is currently focused — the file browser, swarm panes, etc. lock to this root and only
 * change when the active workspace changes.
 *
 * Strategy: pick the first terminal pane's working directory (in pane order). Fall back
 * to any pane that has a usable path. This is stable because pane order doesn't change
 * on focus and the first pane's `workingDirectory` is set when the workspace is created
 * (e.g., from the folder picker) and inherited by subsequent splits.
 */
export function deriveWorkspaceRoot(
  workspace: Workspace | undefined,
): string | null {
  if (!workspace) {
    return null;
  }

  for (const pane of workspace.panes) {
    if (pane.type !== 'terminal') {
      continue;
    }

    const root = getPanePath(pane);
    if (root) {
      return root;
    }
  }

  for (const pane of workspace.panes) {
    const root = getPanePath(pane);
    if (root) {
      return root;
    }
  }

  return null;
}
