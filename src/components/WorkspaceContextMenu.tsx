import { useState, useCallback } from 'react';
import { useWorkspaceStore } from '../state/workspaceStore';
import { ContextMenu, ColorPicker, type ContextMenuItem } from './ContextMenu';

interface MenuState {
  x: number;
  y: number;
  workspaceId: string;
}

/**
 * Hook that provides workspace tab context menu state and handler.
 * Returns the handler to pass to TabBar and the menu element to render.
 */
export function useWorkspaceContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const {
    workspaces,
    renameWorkspace,
    duplicateWorkspace,
    deleteWorkspace,
    setWorkspaceColor,
  } = useWorkspaceStore();

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, workspaceId: string) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, workspaceId });
      setShowColorPicker(false);
    },
    [],
  );

  const closeMenu = useCallback(() => {
    setMenu(null);
    setShowColorPicker(false);
  }, []);

  const startRename = useCallback(
    (workspaceId: string) => {
      const ws = workspaces.find((w) => w.id === workspaceId);
      if (ws) {
        setRenaming(workspaceId);
        setRenameValue(ws.name);
      }
    },
    [workspaces],
  );

  const commitRename = useCallback(() => {
    if (renaming && renameValue.trim()) {
      renameWorkspace(renaming, renameValue.trim());
    }
    setRenaming(null);
    setRenameValue('');
  }, [renaming, renameValue, renameWorkspace]);

  const menuElement = (
    <>
      {menu && !showColorPicker && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          items={buildMenuItems(
            menu.workspaceId,
            startRename,
            duplicateWorkspace,
            deleteWorkspace,
            () => setShowColorPicker(true),
            closeMenu,
          )}
        />
      )}

      {menu && showColorPicker && (
        <div
          className="ctx-menu"
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 1001 }}
        >
          <ColorPicker
            onSelect={(color) => {
              setWorkspaceColor(menu.workspaceId, color);
              closeMenu();
            }}
          />
        </div>
      )}

      {renaming && (
        <div className="rename-overlay">
          <input
            className="rename-overlay__input"
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setRenaming(null);
                setRenameValue('');
              }
            }}
            onBlur={commitRename}
          />
        </div>
      )}
    </>
  );

  return { handleContextMenu, menuElement };
}

function buildMenuItems(
  workspaceId: string,
  startRename: (id: string) => void,
  duplicateWorkspace: (id: string) => void,
  deleteWorkspace: (id: string) => void,
  showColorPicker: () => void,
  closeMenu: () => void,
): ContextMenuItem[] {
  return [
    {
      label: 'Rename',
      action: () => {
        closeMenu();
        startRename(workspaceId);
      },
    },
    {
      label: 'Duplicate',
      action: () => duplicateWorkspace(workspaceId),
    },
    {
      label: 'Assign Color',
      action: showColorPicker,
    },
    {
      label: 'Delete',
      danger: true,
      action: () => deleteWorkspace(workspaceId),
    },
  ];
}
