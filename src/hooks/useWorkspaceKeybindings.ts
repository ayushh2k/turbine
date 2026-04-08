import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { keybindingManager } from '../state/keybindingManager';
import { useSearchStore } from '../state/searchStore';
import { navigatePane } from '../state/layoutEngine';
import type { Workspace } from '../types';

/** Determine split direction based on mouse position relative to the focused pane (Hyprland-style). */
function smartSplitDirection(
  paneId: string,
  mouseX: number,
  mouseY: number,
): 'horizontal' | 'vertical' {
  const el = document.querySelector(`[data-pane-id="${paneId}"]`);
  if (!el) return 'horizontal';
  const rect = el.getBoundingClientRect();
  // Normalize cursor position within the pane to [0, 1]
  const relX = (mouseX - rect.left) / rect.width;
  const relY = (mouseY - rect.top) / rect.height;
  // If cursor is further from center horizontally → split horizontal (new column)
  // If cursor is further from center vertically → split vertical (new row)
  const distX = Math.abs(relX - 0.5);
  const distY = Math.abs(relY - 0.5);
  return distX >= distY ? 'horizontal' : 'vertical';
}

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
  // Track mouse position for Hyprland-style smart split
  const mousePos = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      mousePos.current.x = e.clientX;
      mousePos.current.y = e.clientY;
    };
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => document.removeEventListener('mousemove', onMouseMove);
  }, []);

  useEffect(() => {
    const km = keybindingManager;

    km.register('newWorkspace', () => {
      void import('../utils/openWorkspaceFolder').then((m) => m.openWorkspaceFolder());
    });
    km.register('closePane', () => {
      if (focusedPaneId) {
        handleClosePane(focusedPaneId);
      }
    });
    km.register('commandPalette', () => setShowPalette((visible) => !visible));
    km.register('splitHorizontal', () => {
      if (!focusedPaneId) return;
      // Smart split: choose direction based on cursor position within the pane
      const dir = smartSplitDirection(focusedPaneId, mousePos.current.x, mousePos.current.y);
      if (dir === 'horizontal') {
        handleSplitH(focusedPaneId);
      } else {
        handleSplitV(focusedPaneId);
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
    km.register('searchPanes', () => {
      useSearchStore.getState().toggle();
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
