import { useEffect } from 'react';
import { keybindingManager, DEFAULT_BINDINGS } from '../../state/keybindingManager';
import type { Action } from '../../state/keybindingManager';
import './ShortcutSheet.css';

interface ShortcutSheetProps {
  onClose: () => void;
}

const ACTION_LABELS: Record<Action, string> = {
  newWorkspace: 'New Workspace',
  closePane: 'Close Pane',
  commandPalette: 'Command Palette',
  nextWorkspace: 'Next Workspace',
  prevWorkspace: 'Previous Workspace',
  splitHorizontal: 'Split Horizontal',
  splitVertical: 'Split Vertical',
  navUp: 'Navigate Up',
  navDown: 'Navigate Down',
  navLeft: 'Navigate Left',
  navRight: 'Navigate Right',
  search: 'Search',
  searchPanes: 'Search All Panes',
  toggleBroadcast: 'Toggle Broadcast',
  workspace1: 'Workspace 1',
  workspace2: 'Workspace 2',
  workspace3: 'Workspace 3',
  workspace4: 'Workspace 4',
  workspace5: 'Workspace 5',
  workspace6: 'Workspace 6',
  workspace7: 'Workspace 7',
  workspace8: 'Workspace 8',
  workspace9: 'Workspace 9',
  openSettings: 'Open Settings',
  showShortcuts: 'Keyboard Shortcuts',
};

interface ShortcutGroup {
  label: string;
  actions: Action[];
}

const GROUPS: ShortcutGroup[] = [
  {
    label: 'Workspace',
    actions: ['newWorkspace', 'nextWorkspace', 'prevWorkspace', 'workspace1', 'workspace2', 'workspace3'],
  },
  {
    label: 'Pane',
    actions: ['splitHorizontal', 'splitVertical', 'closePane'],
  },
  {
    label: 'Navigation',
    actions: ['navUp', 'navDown', 'navLeft', 'navRight'],
  },
  {
    label: 'Terminal',
    actions: ['search', 'searchPanes'],
  },
  {
    label: 'Broadcast',
    actions: ['toggleBroadcast'],
  },
  {
    label: 'App',
    actions: ['commandPalette', 'openSettings', 'showShortcuts'],
  },
];

export function ShortcutSheet({ onClose }: ShortcutSheetProps) {
  const bindings = keybindingManager.getBindings();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [onClose]);

  return (
    <div className="shortcut-sheet__backdrop" onClick={onClose}>
      <div
        className="shortcut-sheet"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcut-sheet__header">
          <h2 className="shortcut-sheet__title">Keyboard Shortcuts</h2>
          <button
            className="shortcut-sheet__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="shortcut-sheet__body">
          {GROUPS.map((group) => (
            <div key={group.label} className="shortcut-sheet__group">
              <h3 className="shortcut-sheet__group-title">{group.label}</h3>
              <div className="shortcut-sheet__entries">
                {group.actions.map((action) => {
                  const combo = bindings[action] ?? DEFAULT_BINDINGS[action] ?? '';
                  const label = ACTION_LABELS[action] ?? action;
                  return (
                    <div key={action} className="shortcut-sheet__entry">
                      <span className="shortcut-sheet__action">{label}</span>
                      <kbd className="shortcut-sheet__kbd">{combo}</kbd>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
