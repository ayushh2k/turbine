import { useCallback } from 'react';
import { useWorkspaceStore } from '../state/workspaceStore';
import { openWorkspaceFolder } from '../utils/openWorkspaceFolder';
import type { PaneConfig } from '../types';
import './HomeScreen.css';

interface HomeScreenProps {
  paneId: string;
  workspaceId: string;
  onFocus?: () => void;
  onOpenPalette?: () => void;
  onSelectType?: (type: PaneConfig['type']) => void;
}

const QUICK_ACTIONS: {
  id: PaneConfig['type'];
  label: string;
  description: string;
  icon: string;
}[] = [
  { id: 'terminal', label: 'Terminal', description: 'Open a new shell session', icon: '>' },
  { id: 'code_viewer', label: 'Code Viewer', description: 'Browse and edit files', icon: '#' },
  { id: 'task_board', label: 'Task Board', description: 'Manage tasks and agents', icon: '=' },
  { id: 'diff_viewer', label: 'Diff Viewer', description: 'Review code changes', icon: '+' },
  { id: 'swarm_panel', label: 'Swarm Panel', description: 'Monitor agent swarms', icon: '*' },
];

export function HomeScreen({ paneId, workspaceId, onFocus, onOpenPalette, onSelectType }: HomeScreenProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);

  const convertPane = useCallback(
    (newType: PaneConfig['type']) => {
      useWorkspaceStore.setState((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.id === workspaceId
            ? {
                ...w,
                panes: w.panes.map((p) =>
                  p.id === paneId ? { ...p, type: newType } : p,
                ),
              }
            : w,
        ),
      }));
    },
    [paneId, workspaceId],
  );

  const otherWorkspaces = workspaces.filter((w) => w.id !== workspaceId);

  return (
    <div className="home-screen" onClick={onFocus}>
      <div className="home-screen__content">
        {/* Logo / title */}
        <div className="home-screen__hero">
          <h1 className="home-screen__title">Turbine</h1>
        </div>

        {/* Search prompt */}
        <button className="home-screen__search" onClick={onOpenPalette}>
          <span className="home-screen__search-text">Search commands, files, and workspaces...</span>
          <kbd className="home-screen__search-kbd">Ctrl+P</kbd>
        </button>

        {/* Open folder */}
        <button
          className="home-screen__open-folder"
          onClick={() => void openWorkspaceFolder()}
        >
          <span className="home-screen__open-folder-icon">+</span>
          <span className="home-screen__open-folder-text">
            <strong>Open Folder</strong>
            <span>Start a new workspace from a project directory</span>
          </span>
        </button>

        {/* Quick actions */}
        <div className="home-screen__section">
          <div className="home-screen__section-header">
            <h2 className="home-screen__section-title">Quick Actions</h2>
          </div>
          <div className="home-screen__actions-grid">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.id}
                className="home-screen__action-card"
                onClick={() => onSelectType ? onSelectType(action.id) : convertPane(action.id)}
              >
                <span className="home-screen__action-icon">{action.icon}</span>
                <span className="home-screen__action-info">
                  <span className="home-screen__action-label">{action.label}</span>
                  <span className="home-screen__action-desc">{action.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Other workspaces */}
        {otherWorkspaces.length > 0 && (
          <div className="home-screen__section">
            <div className="home-screen__section-header">
              <h2 className="home-screen__section-title">Other Workspaces</h2>
            </div>
            <div className="home-screen__workspaces-list">
              {otherWorkspaces.map((ws) => (
                <button
                  key={ws.id}
                  className="home-screen__workspace-row"
                  onClick={() => switchWorkspace(ws.id)}
                >
                  <span
                    className="home-screen__workspace-dot"
                    style={{ backgroundColor: ws.tabColor ?? 'var(--color-accent)' }}
                  />
                  <span className="home-screen__workspace-name">{ws.name}</span>
                  <span className="home-screen__workspace-meta">
                    {ws.panes.length} pane{ws.panes.length !== 1 ? 's' : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
