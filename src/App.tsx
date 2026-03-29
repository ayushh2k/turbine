import { useEffect, useState, useCallback, useMemo, Component, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useWorkspaceStore, createDefaultPane } from './state/workspaceStore';
import { useSettingsStore } from './state/settingsStore';
import { applyTheme, getAllThemes } from './themes/themeEngine';
import { findLeafIds, movePane } from './state/layoutEngine';
import { useBroadcast } from './hooks/useBroadcast';
import { usePtyStatusListener } from './hooks/usePtyStatus';
import { useAppStartup } from './hooks/useAppStartup';
import { useWorkspaceKeybindings } from './hooks/useWorkspaceKeybindings';
import { TabBar } from './components/TabBar';
import { PaneContainer } from './components/PaneContainer';
import { FileBrowser } from './components/FileBrowser';
import { TemplatePicker } from './components/TemplatePicker';
import { useWorkspaceContextMenu } from './components/WorkspaceContextMenu';
import { CommandPalette, type PaletteAction } from './components/CommandPalette';
import { SettingsPanel } from './components/SettingsPanel';
import type { FileTreeEntry, PaneTemplate } from './types';
import { deriveWorkspaceRoot } from './utils/workspaceRoots';
import { getPaneTypeForPath } from './utils/mediaFiles';
import {
  applyTemplate,
  splitHorizontal,
  splitVertical,
  closePane,
  resizePane,
} from './state/layoutEngine';
import './App.css';

function App() {
  const [showPalette, setShowPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<FileTreeEntry[]>([]);
  const [fileIndexVersion, setFileIndexVersion] = useState(0);
  const { handleContextMenu, menuElement: contextMenuElement } = useWorkspaceContextMenu();

  const {
    workspaces,
    activeWorkspaceId,
    switchWorkspace,
    createWorkspace,
    persistAll,
  } = useWorkspaceStore();

  const { settings } = useSettingsStore();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const broadcastPaneIds = useMemo(
    () =>
      activeWorkspace?.panes
        .filter((pane) => pane.type === 'terminal')
        .map((pane) => pane.id) ?? [],
    [activeWorkspace],
  );

  const { broadcastWrite, broadcastMode, toggleBroadcast } = useBroadcast(
    focusedPaneId,
    broadcastPaneIds,
  );
  const workspaceRoot = useMemo(
    () => deriveWorkspaceRoot(activeWorkspace, focusedPaneId),
    [activeWorkspace, focusedPaneId],
  );
  const activeFilePath =
    activeWorkspace?.panes.find(
      (pane) =>
        pane.id === focusedPaneId &&
        (pane.type === 'code_viewer' || pane.type === 'media_viewer'),
    )?.workingDirectory ??
    activeWorkspace?.panes.find(
      (pane) => pane.type === 'code_viewer' || pane.type === 'media_viewer',
    )?.workingDirectory ??
    null;

  // Listen for PTY exit events and track per-pane process status
  usePtyStatusListener();
  const loading = useAppStartup(createWorkspace);

  // Only pass broadcastWrite when broadcast mode is active
  const activeBroadcastWrite = broadcastMode ? broadcastWrite : undefined;

  // Apply theme when it changes
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    if (!loading && workspaces.length === 0) {
      createWorkspace('Workspace 1');
    }
  }, [loading, workspaces.length, createWorkspace]);

  // Update window title when active workspace changes
  useEffect(() => {
    if (activeWorkspace) {
      getCurrentWindow().setTitle(`Turbine \u2014 ${activeWorkspace.name}`).catch(() => {});
    }
  }, [activeWorkspace?.name]);

  // Persist on changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      persistAll().catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [workspaces, activeWorkspaceId, persistAll]);

  useEffect(() => {
    if (!workspaceRoot) {
      setProjectFiles([]);
      return;
    }

    let cancelled = false;

    invoke<Array<{
      path: string;
      relative_path: string;
      is_dir: boolean;
    }>>('list_workspace_files', { root: workspaceRoot })
      .then((entries) => {
        if (!cancelled) {
          setProjectFiles(
            entries.map((entry) => ({
              path: entry.path,
              relativePath: entry.relative_path,
              isDir: entry.is_dir,
            })),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectFiles([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceRoot, fileIndexVersion]);

  // Layout operations — helper to create PaneConfigs for new leaves after a split
  const splitAndAddPanes = useCallback(
    (splitFn: (layout: import('./types').LayoutNode, paneId: string) => import('./types').LayoutNode, paneId: string) => {
      if (!activeWorkspace || !activeWorkspaceId) return;
      const newLayout = splitFn(activeWorkspace.layout, paneId);
      const existingIds = new Set(activeWorkspace.panes.map((p) => p.id));
      const newLeafIds = findLeafIds(newLayout).filter((id) => !existingIds.has(id));
      const newPanes = newLeafIds.map((id) => ({ ...createDefaultPane(activeWorkspaceId), id }));
      useWorkspaceStore.setState((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.id === activeWorkspaceId
            ? { ...w, layout: newLayout, panes: [...w.panes, ...newPanes] }
            : w,
        ),
      }));
    },
    [activeWorkspace, activeWorkspaceId],
  );

  const handleSplitH = useCallback(
    (paneId: string) => splitAndAddPanes(splitHorizontal, paneId),
    [splitAndAddPanes],
  );

  const handleSplitV = useCallback(
    (paneId: string) => splitAndAddPanes(splitVertical, paneId),
    [splitAndAddPanes],
  );

  const handleClosePane = useCallback(
    (paneId: string) => {
      if (!activeWorkspace || !activeWorkspaceId) return;
      const newLayout = closePane(activeWorkspace.layout, paneId);
      const remainingIds = new Set(findLeafIds(newLayout));
      useWorkspaceStore.setState((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.id === activeWorkspaceId
            ? { ...w, layout: newLayout, panes: w.panes.filter((p) => remainingIds.has(p.id)) }
            : w,
        ),
      }));
    },
    [activeWorkspace, activeWorkspaceId],
  );

  const handleResize = useCallback(
    (paneId: string, delta: number) => {
      if (!activeWorkspace) return;
      const newLayout = resizePane(activeWorkspace.layout, paneId, delta);
      useWorkspaceStore.setState((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.id === activeWorkspaceId ? { ...w, layout: newLayout } : w,
        ),
      }));
    },
    [activeWorkspace, activeWorkspaceId],
  );

  // Apply a pane layout template
  const handleApplyTemplate = useCallback(
    (template: PaneTemplate) => {
      if (!activeWorkspace || !activeWorkspaceId) return;
      const newLayout = applyTemplate(template);
      const newPaneIds = findLeafIds(newLayout);
      const newPanes = newPaneIds.map((id) => ({
        ...createDefaultPane(activeWorkspaceId),
        id,
      }));
      useWorkspaceStore.setState((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.id === activeWorkspaceId
            ? { ...w, layout: newLayout, panes: newPanes }
            : w,
        ),
      }));
    },
    [activeWorkspace, activeWorkspaceId],
  );

  // Update individual pane config (auto-launch, startup command)
  const handlePaneConfigChange = useCallback(
    (paneId: string, changes: Partial<import('./types').PaneConfig>) => {
      if (!activeWorkspaceId) return;
      useWorkspaceStore.setState((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.id === activeWorkspaceId
            ? {
                ...w,
                panes: w.panes.map((p) =>
                  p.id === paneId ? { ...p, ...changes } : p,
                ),
              }
            : w,
        ),
      }));
    },
    [activeWorkspaceId],
  );

  const handleMovePane = useCallback(
    (fromId: string, toId: string) => {
      if (!activeWorkspace || !activeWorkspaceId) return;
      const newLayout = movePane(activeWorkspace.layout, fromId, toId);
      useWorkspaceStore.setState((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.id === activeWorkspaceId ? { ...w, layout: newLayout } : w,
        ),
      }));
    },
    [activeWorkspace, activeWorkspaceId],
  );

  const handleRefreshProjectFiles = useCallback(() => {
    setFileIndexVersion((version) => version + 1);
  }, []);

  const handleOpenFile = useCallback(
    (filePath: string, mode: 'current' | 'new-pane' = 'current') => {
      if (!activeWorkspace || !activeWorkspaceId) {
        return;
      }

      const paneType = getPaneTypeForPath(filePath);

      const createViewerPaneForFile = () => {
        const sourcePaneId = focusedPaneId ?? activeWorkspace.panes[0]?.id;
        if (!sourcePaneId) {
          return;
        }

        const newLayout = splitHorizontal(activeWorkspace.layout, sourcePaneId);
        const existingIds = new Set(activeWorkspace.panes.map((pane) => pane.id));
        const newPaneId = findLeafIds(newLayout).find((paneId) => !existingIds.has(paneId));
        if (!newPaneId) {
          return;
        }

        const pane = createDefaultPane(activeWorkspaceId);
        pane.id = newPaneId;
        pane.type = paneType;
        pane.workingDirectory = filePath;

        useWorkspaceStore.setState((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === activeWorkspaceId
              ? { ...workspace, layout: newLayout, panes: [...workspace.panes, pane] }
              : workspace,
          ),
        }));
        setFocusedPaneId(newPaneId);
      };

      if (mode === 'new-pane') {
        createViewerPaneForFile();
        return;
      }

      const existingViewerPane =
        activeWorkspace.panes.find((pane) => pane.id === focusedPaneId && pane.type === paneType) ??
        activeWorkspace.panes.find((pane) => pane.type === paneType);

      if (existingViewerPane) {
        useWorkspaceStore.setState((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === activeWorkspaceId
              ? {
                  ...workspace,
                  panes: workspace.panes.map((pane) =>
                    pane.id === existingViewerPane.id
                      ? { ...pane, type: paneType, workingDirectory: filePath }
                      : pane,
                  ),
                }
              : workspace,
          ),
        }));
        setFocusedPaneId(existingViewerPane.id);
        return;
      }

      createViewerPaneForFile();
    },
    [activeWorkspace, activeWorkspaceId, focusedPaneId],
  );

  useWorkspaceKeybindings({
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
  });

  // Command palette actions
  const paletteActions: PaletteAction[] = useMemo(() => {
    const actions: PaletteAction[] = [
      { id: 'new-workspace', label: 'New Workspace', category: 'Workspace', shortcut: 'Ctrl+T', handler: () => createWorkspace() },
      { id: 'toggle-broadcast', label: 'Toggle Broadcast Mode', category: 'Broadcast', shortcut: 'Ctrl+Shift+B', handler: toggleBroadcast },
      { id: 'open-settings', label: 'Open Settings', category: 'App', shortcut: 'Ctrl+,', handler: () => setShowSettings(true) },
      { id: 'refresh-project-files', label: 'Refresh Project Files', category: 'File', handler: handleRefreshProjectFiles },
    ];

    // Workspace switching
    const sorted = [...workspaces].sort((a, b) => a.tabOrder - b.tabOrder);
    for (let i = 0; i < sorted.length; i++) {
      const ws = sorted[i];
      actions.push({
        id: `switch-${ws.id}`,
        label: `Switch to ${ws.name}`,
        category: 'Workspace',
        shortcut: i < 9 ? `Ctrl+${i + 1}` : undefined,
        handler: () => switchWorkspace(ws.id),
      });
    }

    // Pane operations
    if (focusedPaneId) {
      actions.push(
        { id: 'split-h', label: 'Split Horizontal', category: 'Pane', shortcut: 'Ctrl+D', handler: () => handleSplitH(focusedPaneId) },
        { id: 'split-v', label: 'Split Vertical', category: 'Pane', shortcut: 'Ctrl+Shift+D', handler: () => handleSplitV(focusedPaneId) },
        { id: 'close-pane', label: 'Close Pane', category: 'Pane', shortcut: 'Ctrl+W', handler: () => handleClosePane(focusedPaneId) },
      );
    }

    for (const entry of projectFiles.filter((entry) => !entry.isDir).slice(0, 2000)) {
      actions.push({
        id: `file-current-${entry.relativePath}`,
        label: `Open ${entry.relativePath}`,
        category: 'File',
        handler: () => handleOpenFile(entry.path, 'current'),
      });
      actions.push({
        id: `file-pane-${entry.relativePath}`,
        label: `Open ${entry.relativePath} in New Pane`,
        category: 'File',
        handler: () => handleOpenFile(entry.path, 'new-pane'),
      });
    }

    // Open file in code viewer
    if (focusedPaneId && activeWorkspace) {
      actions.push({
        id: 'open-file',
        label: 'Open File in Code Viewer',
        category: 'Pane',
        handler: () => {
          // Split the focused pane and make the new pane a code viewer
          const newLayout = splitHorizontal(activeWorkspace.layout, focusedPaneId);
          const existingIds = new Set(findLeafIds(activeWorkspace.layout));
          const newIds = findLeafIds(newLayout).filter((id) => !existingIds.has(id));
          const newPaneId = newIds[0];
          if (newPaneId) {
            const pane = createDefaultPane(activeWorkspace.id);
            pane.id = newPaneId;
            pane.type = 'code_viewer';
            pane.workingDirectory = '.'; // user will configure via file watcher
            useWorkspaceStore.setState((s) => ({
              workspaces: s.workspaces.map((w) =>
                w.id === activeWorkspaceId
                  ? { ...w, layout: newLayout, panes: [...w.panes, pane] }
                  : w,
              ),
            }));
          }
        },
      });
    }

    // Theme selection
    for (const theme of getAllThemes()) {
      actions.push({
        id: `theme-${theme.id}`,
        label: theme.name,
        category: 'Theme',
        handler: () => useSettingsStore.getState().saveSettings({ theme: theme.id }),
      });
    }

    return actions;
  }, [workspaces, focusedPaneId, activeWorkspace, activeWorkspaceId, createWorkspace, switchWorkspace, handleSplitH, handleSplitV, handleClosePane, toggleBroadcast, projectFiles, handleOpenFile, handleRefreshProjectFiles]);

  if (loading) {
    return (
      <div className="app">
        <div className="app__loading">Starting Turbine...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="app">
        <div className="app__header">
          <TabBar onContextMenu={handleContextMenu} />
          <TemplatePicker onSelect={handleApplyTemplate} />
        </div>
        <div className="app__content">
          <FileBrowser
            rootPath={workspaceRoot}
            entries={projectFiles}
            activeFilePath={activeFilePath}
            onOpenFile={handleOpenFile}
            onRefresh={handleRefreshProjectFiles}
          />
          <div className="app__workspace">
            {workspaces.map((workspace) => (
              <div
                key={workspace.id}
                className={[
                  'app__workspace-panel',
                  workspace.id === activeWorkspaceId ? 'app__workspace-panel--active' : '',
                ].filter(Boolean).join(' ')}
              >
                <PaneContainer
                  layout={workspace.layout}
                  panes={workspace.panes}
                  focusedPaneId={workspace.id === activeWorkspaceId ? focusedPaneId : null}
                  onFocusPane={setFocusedPaneId}
                  onResize={handleResize}
                  onSplitH={handleSplitH}
                  onSplitV={handleSplitV}
                  onClosePane={handleClosePane}
                  broadcastWrite={workspace.id === activeWorkspaceId ? activeBroadcastWrite : undefined}
                  onPaneConfigChange={handlePaneConfigChange}
                  onMovePane={handleMovePane}
                  themeId={settings.theme}
                />
              </div>
            ))}
          </div>
        </div>

        {showPalette && (
          <CommandPalette
            actions={paletteActions}
            onClose={() => setShowPalette(false)}
          />
        )}

        {showSettings && (
          <SettingsPanel onClose={() => setShowSettings(false)} />
        )}

        {contextMenuElement}
      </div>
    </ErrorBoundary>
  );
}

// Error Boundary
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app__error-boundary">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Reload Workspace
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default App;
