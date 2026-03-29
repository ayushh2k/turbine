import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { keybindingManager } from '../state/keybindingManager';
import { navigatePane } from '../state/layoutEngine';
import type { Workspace } from '../types';

interface UseWorkspaceKeybindingsOptions {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeWorkspace: Workspace | undefined;
  focusedPaneId: string | null;
  createWorkspace: (name?: string) => unknown;
  switchWorkspace: (id: string) => void;
  handleClosePane: (paneId: string) => void;
  handleSplitH: (paneId: string) => void;
  handleSplitV: (paneId: string) => void;
  toggleBroadcast: () => void;
  setShowPalette: Dispatch<SetStateAction<boolean>>;
  setShowSettings: Dispatch<SetStateAction<boolean>>;
  setFocusedPaneId: Dispatch<SetStateAction<string | null>>;
}

export function useWorkspaceKeybindings({
  workspaces,
  activeWorkspaceId,
  activeWorkspace,
  focusedPaneId,
  createWorkspace,
  switchWorkspace,
  handleClosePane,
  handleSplitH,
  handleSplitV,
  toggleBroadcast,
  setShowPalette,
  setShowSettings,
  setFocusedPaneId,
}: UseWorkspaceKeybindingsOptions) {
  useEffect(() => {
    const km = keybindingManager;

    km.register('newWorkspace', () => createWorkspace());
    km.register('closePane', () => {
      if (focusedPaneId) {
        handleClosePane(focusedPaneId);
      }
    });
    km.register('commandPalette', () => setShowPalette((visible) => !visible));
    km.register('splitHorizontal', () => {
      if (focusedPaneId) {
        handleSplitH(focusedPaneId);
      }
    });
    km.register('splitVertical', () => {
      if (focusedPaneId) {
        handleSplitV(focusedPaneId);
      }
    });
    km.register('toggleBroadcast', toggleBroadcast);
    km.register('openSettings', () => setShowSettings((visible) => !visible));
    km.register('search', () => {
      if (focusedPaneId) {
        window.dispatchEvent(
          new CustomEvent('turbine:search-focused-pane', {
            detail: { paneId: focusedPaneId },
          }),
        );
      }
    });

    km.register('nextWorkspace', () => {
      const sorted = [...workspaces].sort((a, b) => a.tabOrder - b.tabOrder);
      const idx = sorted.findIndex((workspace) => workspace.id === activeWorkspaceId);
      if (sorted.length > 0) {
        switchWorkspace(sorted[(idx + 1) % sorted.length].id);
      }
    });

    km.register('prevWorkspace', () => {
      const sorted = [...workspaces].sort((a, b) => a.tabOrder - b.tabOrder);
      const idx = sorted.findIndex((workspace) => workspace.id === activeWorkspaceId);
      if (sorted.length > 0) {
        switchWorkspace(sorted[(idx - 1 + sorted.length) % sorted.length].id);
      }
    });

    const workspaceNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
    for (const n of workspaceNumbers) {
      km.register(`workspace${n}`, () => {
        const sorted = [...workspaces].sort((a, b) => a.tabOrder - b.tabOrder);
        if (sorted[n - 1]) {
          switchWorkspace(sorted[n - 1].id);
        }
      });
    }

    km.register('navUp', () => {
      if (focusedPaneId && activeWorkspace) {
        setFocusedPaneId(navigatePane(activeWorkspace.layout, focusedPaneId, 'up'));
      }
    });
    km.register('navDown', () => {
      if (focusedPaneId && activeWorkspace) {
        setFocusedPaneId(navigatePane(activeWorkspace.layout, focusedPaneId, 'down'));
      }
    });
    km.register('navLeft', () => {
      if (focusedPaneId && activeWorkspace) {
        setFocusedPaneId(navigatePane(activeWorkspace.layout, focusedPaneId, 'left'));
      }
    });
    km.register('navRight', () => {
      if (focusedPaneId && activeWorkspace) {
        setFocusedPaneId(navigatePane(activeWorkspace.layout, focusedPaneId, 'right'));
      }
    });

    km.activate();

    return () => {
      km.deactivate();
    };
  }, [
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    focusedPaneId,
    createWorkspace,
    switchWorkspace,
    handleClosePane,
    handleSplitH,
    handleSplitV,
    toggleBroadcast,
    setShowPalette,
    setShowSettings,
    setFocusedPaneId,
  ]);
}
