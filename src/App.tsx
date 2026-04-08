import { useEffect, useState, useCallback, useMemo, Component, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useWorkspaceStore, createDefaultPane } from './state/workspaceStore';
import { useSwarmStore } from './state/swarmStore';
import { useSettingsStore } from './state/settingsStore';
import { applyTheme, getAllThemes } from './themes/themeEngine';
import { findLeafIds, movePane, resizeAtPath, createCodeAndConsolePreset, createWebDevPreset, applyTemplate, splitHorizontal, splitVertical, closePane } from './state/layoutEngine';
import { useBroadcast } from './hooks/useBroadcast';
import { usePtyStatusListener } from './hooks/usePtyStatus';
import { useAppStartup } from './hooks/useAppStartup';
import { useWorkspaceKeybindings } from './hooks/useWorkspaceKeybindings';
import { TabBar } from './components/TabBar';
import { PaneContainer } from './components/PaneContainer';
import { HomeScreen } from './components/HomeScreen';
import { useWorkspaceContextMenu } from './components/WorkspaceContextMenu';
import { CommandPalette, type PaletteAction } from './components/CommandPalette';
import { SettingsPanel } from './components/SettingsPanel';
import { ActivityBar, type SidePanelId } from './components/ActivityBar';
import { SidePanel } from './components/SidePanel';
import type { FileTreeEntry, PaneTemplate, PaneConfig } from './types';
import type { RunTaskRequest } from './components/TaskBoard';
import { deriveWorkspaceRoot } from './utils/workspaceRoots';
import { getPaneTypeForPath } from './utils/mediaFiles';
import { openWorkspaceFolder } from './utils/openWorkspaceFolder';
import { UpdateNotification } from './components/UpdateNotification';
import './App.css';

function replaceLeafPaneId(node: import('./types').LayoutNode, fromId: string, toId: string): import('./types').LayoutNode {
  if (node.type === 'leaf') {
    return { ...node, paneId: node.paneId === fromId ? toId : node.paneId };
  }
  return {
    ...node,
    children: [
      replaceLeafPaneId(node.children[0], fromId, toId),
      replaceLeafPaneId(node.children[1], fromId, toId),
    ],
  };
}

function App() {
  const [showPalette, setShowPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHome, setShowHome] = useState(false);
  const [activePanel, setActivePanel] = useState<SidePanelId | null>(null);

  const handlePanelToggle = useCallback((panel: SidePanelId) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }, []);

  const handleHomeSelectType = useCallback((type: PaneConfig['type']) => {
    setShowHome(false);
    const ws = useWorkspaceStore.getState().workspaces.find(
      (w) => w.id === useWorkspaceStore.getState().activeWorkspaceId,
    );
    const targetPaneId = ws?.panes[0]?.id;
    if (!targetPaneId || !ws) return;
    useWorkspaceStore.setState((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === ws.id
          ? { ...w, panes: w.panes.map((p) => (p.id === targetPaneId ? { ...p, type } : p)) }
          : w,
      ),
    }));
  }, []);
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
  const pendingSwarmAgentPanes = useSwarmStore((s) => s.pendingAgentPanes);
  const consumePendingAgentPane = useSwarmStore((s) => s.consumePendingAgentPane);
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

  // Dismiss home view when user switches workspace
  useEffect(() => {
    setShowHome(false);
  }, [activeWorkspaceId]);

  // Update window title when active workspace changes
  useEffect(() => {
    if (showHome) {
      getCurrentWindow().setTitle('Turbine — Home').catch(() => {});
    } else if (activeWorkspace) {
      getCurrentWindow().setTitle(`Turbine \u2014 ${activeWorkspace.name}`).catch(() => {});
    }
  }, [activeWorkspace?.name, showHome]);

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
      // Auto-focus the new pane (Hyprland-style)
      if (newLeafIds.length > 0) {
        setFocusedPaneId(newLeafIds[0]);
      }
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
      const remainingIds = findLeafIds(newLayout);
      useWorkspaceStore.setState((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.id === activeWorkspaceId
            ? { ...w, layout: newLayout, panes: w.panes.filter((p) => remainingIds.includes(p.id)) }
            : w,
        ),
      }));
      // Auto-focus the nearest remaining pane
      if (paneId === focusedPaneId && remainingIds.length > 0) {
        setFocusedPaneId(remainingIds[0]);
      }
    },
    [activeWorkspace, activeWorkspaceId, focusedPaneId],
  );

  const handleResize = useCallback(
    (path: number[], delta: number) => {
      // Read current state directly to avoid stale closures during drag
      const { workspaces, activeWorkspaceId: awId } = useWorkspaceStore.getState();
      const ws = workspaces.find((w) => w.id === awId);
      if (!ws) return;
      const newLayout = resizeAtPath(ws.layout, path, delta);
      useWorkspaceStore.setState((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.id === awId ? { ...w, layout: newLayout } : w,
        ),
      }));
    },
    [],
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

  // Run an agent CLI command for a task — creates a new terminal pane and executes the command
  const handleRunTaskCommand = useCallback(
    ({ task, command, agentLabel }: RunTaskRequest) => {
      if (!activeWorkspace || !activeWorkspaceId) return;

      // Find a source pane to split from (prefer focused, fall back to first)
      const sourcePaneId = focusedPaneId ?? activeWorkspace.panes[0]?.id;
      if (!sourcePaneId) return;

      const newLayout = splitHorizontal(activeWorkspace.layout, sourcePaneId);
      const existingIds = new Set(findLeafIds(activeWorkspace.layout));
      const newIds = findLeafIds(newLayout).filter((id) => !existingIds.has(id));
      const newPaneId = newIds[0];

      if (newPaneId) {
        const pane = createDefaultPane(activeWorkspaceId);
        pane.id = newPaneId;
        pane.type = 'terminal';
        pane.startupCommand = command;
        pane.autoLaunch = true;
        pane.workingDirectory = workspaceRoot || '.';
        pane.label = `${agentLabel}: ${task.title}`;
        pane.taskId = task.id;

        useWorkspaceStore.setState((state) => ({
          workspaces: state.workspaces.map((ws) =>
            ws.id === activeWorkspaceId
              ? {
                  ...ws,
                  layout: newLayout,
                  panes: [...ws.panes, pane],
                }
              : ws,
          ),
        }));
        setFocusedPaneId(newPaneId);
      }
    },
    [activeWorkspace, activeWorkspaceId, focusedPaneId, workspaceRoot],
  );

  const handleOpenSwarmAgentPane = useCallback(
    (item: { agent: import('./types').SwarmAgent; workspaceId: string; sourcePaneId: string | null; projectPath: string }) => {
      const state = useWorkspaceStore.getState();
      const paneAlreadyExists = state.workspaces.some((workspace) =>
        workspace.panes.some((pane) => pane.id === item.agent.pane_id),
      );
      if (paneAlreadyExists) {
        consumePendingAgentPane(item.agent.pane_id);
        return;
      }

      const targetWorkspace = state.workspaces.find((workspace) => workspace.id === item.workspaceId);
      if (!targetWorkspace) {
        consumePendingAgentPane(item.agent.pane_id);
        return;
      }

      const sourcePaneId =
        (item.sourcePaneId && targetWorkspace.panes.some((pane) => pane.id === item.sourcePaneId))
          ? item.sourcePaneId
          : targetWorkspace.panes[0]?.id;
      if (!sourcePaneId) {
        consumePendingAgentPane(item.agent.pane_id);
        return;
      }

      const splitLayout = splitHorizontal(targetWorkspace.layout, sourcePaneId);
      const existingIds = new Set(findLeafIds(targetWorkspace.layout));
      const generatedPaneId = findLeafIds(splitLayout).find((id) => !existingIds.has(id));
      if (!generatedPaneId) {
        consumePendingAgentPane(item.agent.pane_id);
        return;
      }

      const pane = createDefaultPane(item.workspaceId);
      pane.id = item.agent.pane_id;
      pane.type = 'terminal';
      pane.workingDirectory = item.projectPath;
      pane.startupCommand = item.agent.command;
      pane.autoLaunch = true;
      pane.label = item.agent.role;

      useWorkspaceStore.setState((current) => ({
        workspaces: current.workspaces.map((workspace) =>
          workspace.id === item.workspaceId
            ? {
                ...workspace,
                layout: replaceLeafPaneId(splitLayout, generatedPaneId, item.agent.pane_id),
                panes: [...workspace.panes, pane],
              }
            : workspace,
        ),
      }));

      if (item.workspaceId === activeWorkspaceId) {
        setFocusedPaneId(item.agent.pane_id);
      }
      consumePendingAgentPane(item.agent.pane_id);
    },
    [activeWorkspaceId, consumePendingAgentPane],
  );

  useEffect(() => {
    pendingSwarmAgentPanes.forEach(handleOpenSwarmAgentPane);
  }, [pendingSwarmAgentPanes, handleOpenSwarmAgentPane]);

  // Update individual pane config (auto-launch, startup command)
  const handlePaneConfigChange = useCallback(
    (paneId: string, changes: Partial<import('./types').PaneConfig>) => {
      if (!activeWorkspaceId) return;

      // Prevent no-op updates that cause infinite re-render cycles
      const currentWorkspace = useWorkspaceStore.getState().workspaces.find((w) => w.id === activeWorkspaceId);
      const currentPane = currentWorkspace?.panes.find((p) => p.id === paneId);
      
      if (currentPane) {
        let hasChanges = false;
        for (const [key, value] of Object.entries(changes)) {
          if (currentPane[key as keyof typeof currentPane] !== value) {
            hasChanges = true;
            break;
          }
        }
        if (!hasChanges) {
          return;
        }
      }

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
      { id: 'new-workspace', label: 'Open Folder as Workspace', category: 'Workspace', shortcut: 'Ctrl+T', type: 'command', handler: () => void openWorkspaceFolder() },
      { id: 'new-workspace-code-console', label: 'New Workspace (Code + Console)', category: 'Workspace', type: 'command', handler: () => createWorkspace('Code & Console', createCodeAndConsolePreset()) },
      { id: 'new-workspace-web-dev', label: 'New Workspace (Web Dev)', category: 'Workspace', type: 'command', handler: () => createWorkspace('Web Dev', createWebDevPreset()) },
      { id: 'toggle-broadcast', label: 'Toggle Broadcast Mode', category: 'Broadcast', shortcut: 'Ctrl+Shift+B', type: 'command', handler: toggleBroadcast },
      { id: 'open-settings', label: 'Open Settings', category: 'App', shortcut: 'Ctrl+,', type: 'command', handler: () => setShowSettings(true) },
      { id: 'refresh-project-files', label: 'Refresh Project Files', category: 'File', type: 'command', handler: handleRefreshProjectFiles },
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
        type: 'command',
        handler: () => switchWorkspace(ws.id),
      });
    }

    // Pane operations
    if (focusedPaneId) {
      actions.push(
        { id: 'split-h', label: 'Split Horizontal', category: 'Pane', shortcut: 'Ctrl+D', type: 'command', handler: () => handleSplitH(focusedPaneId) },
        { id: 'split-v', label: 'Split Vertical', category: 'Pane', shortcut: 'Ctrl+Shift+D', type: 'command', handler: () => handleSplitV(focusedPaneId) },
        { id: 'close-pane', label: 'Close Pane', category: 'Pane', shortcut: 'Ctrl+W', type: 'command', handler: () => handleClosePane(focusedPaneId) },
      );
    }

    for (const entry of projectFiles.filter((entry) => !entry.isDir).slice(0, 2000)) {
      actions.push({
        id: `file-current-${entry.relativePath}`,
        label: entry.relativePath,
        category: 'File',
        type: 'file',
        filePath: entry.relativePath,
        handler: () => handleOpenFile(entry.path, 'current'),
      });
    }

    // Open file in code viewer
    if (focusedPaneId && activeWorkspace) {
      actions.push({
        id: 'open-file',
        label: 'Open File in Code Viewer',
        category: 'Pane',
        type: 'command',
        handler: () => {
          const newLayout = splitHorizontal(activeWorkspace.layout, focusedPaneId);
          const existingIds = new Set(findLeafIds(activeWorkspace.layout));
          const newIds = findLeafIds(newLayout).filter((id) => !existingIds.has(id));
          const newPaneId = newIds[0];
          if (newPaneId) {
            const pane = createDefaultPane(activeWorkspace.id);
            pane.id = newPaneId;
            pane.type = 'code_viewer';
            pane.workingDirectory = '.';
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

      actions.push({
        id: 'open-task-board',
        label: 'Open Task Board',
        category: 'Pane',
        type: 'command',
        handler: () => {
          const newLayout = splitHorizontal(activeWorkspace.layout, focusedPaneId);
          const existingIds = new Set(findLeafIds(activeWorkspace.layout));
          const newIds = findLeafIds(newLayout).filter((id) => !existingIds.has(id));
          const newPaneId = newIds[0];
          if (newPaneId) {
            const pane = createDefaultPane(activeWorkspace.id);
            pane.id = newPaneId;
            pane.type = 'task_board';
            pane.workingDirectory = workspaceRoot || '.';
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

      actions.push({
        id: 'open-swarm-panel',
        label: 'Open Swarm Panel',
        category: 'Pane',
        type: 'command',
        handler: () => {
          const newLayout = splitHorizontal(activeWorkspace.layout, focusedPaneId);
          const existingIds = new Set(findLeafIds(activeWorkspace.layout));
          const newIds = findLeafIds(newLayout).filter((id) => !existingIds.has(id));
          const newPaneId = newIds[0];
          if (newPaneId) {
            const pane = createDefaultPane(activeWorkspace.id);
            pane.id = newPaneId;
            pane.type = 'swarm_panel';
            pane.workingDirectory = workspaceRoot || '.';
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

      actions.push({
        id: 'open-diff-viewer',
        label: 'Review Agent Changes (Show Diffs)',
        category: 'Pane',
        type: 'command',
        handler: () => {
          const newLayout = splitHorizontal(activeWorkspace.layout, focusedPaneId);
          const existingIds = new Set(findLeafIds(activeWorkspace.layout));
          const newIds = findLeafIds(newLayout).filter((id) => !existingIds.has(id));
          const newPaneId = newIds[0];
          if (newPaneId) {
            const pane = createDefaultPane(activeWorkspace.id);
            pane.id = newPaneId;
            pane.type = 'diff_viewer';
            pane.workingDirectory = workspaceRoot || '.';
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
        type: 'command',
        handler: () => useSettingsStore.getState().saveSettings({ theme: theme.id }),
      });
    }

    return actions;
  }, [workspaces, focusedPaneId, activeWorkspace, activeWorkspaceId, createWorkspace, switchWorkspace, handleSplitH, handleSplitV, handleClosePane, toggleBroadcast, projectFiles, handleOpenFile, handleRefreshProjectFiles]);

  if (loading) {
    return (
      <div className="app" role="status" aria-label="Loading Turbine">
        <div className="app__loading">
          <div className="app__loading-spinner" />
          <span>Starting Turbine...</span>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="app">
        <nav className="app__header" aria-label="Workspace tabs">
          <TabBar
            onContextMenu={handleContextMenu}
            onApplyTemplate={handleApplyTemplate}
            homeActive={showHome}
            onHomeClick={() => setShowHome(true)}
          />
        </nav>
        <main className="app__content" role="main">
          <ActivityBar
            activePanel={activePanel}
            onPanelToggle={handlePanelToggle}
            onOpenSettings={() => setShowSettings(true)}
            broadcastMode={broadcastMode}
            onToggleBroadcast={toggleBroadcast}
          />
          <SidePanel
            activePanel={activePanel}
            workspaceId={activeWorkspaceId}
            focusedPaneId={focusedPaneId}
            rootPath={workspaceRoot}
            entries={projectFiles}
            activeFilePath={activeFilePath}
            onOpenFile={handleOpenFile}
            onRefresh={handleRefreshProjectFiles}
            onRunTask={handleRunTaskCommand}
          />
          <div className="app__workspace">
            {showHome ? (
              <HomeScreen
                paneId="__home__"
                workspaceId={activeWorkspaceId ?? ''}
                onFocus={() => {}}
                onOpenPalette={() => setShowPalette(true)}
                onSelectType={handleHomeSelectType}
              />
            ) : (
              workspaces.map((workspace) => (
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
                    onRunTask={workspace.id === activeWorkspaceId ? handleRunTaskCommand : undefined}
                    onOpenPalette={() => setShowPalette(true)}
                    themeId={settings.theme}
                  />
                </div>
              ))
            )}
          </div>
        </main>

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
        <UpdateNotification />
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
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app__error-boundary" style={{ padding: '20px', overflow: 'auto', background: '#222', color: '#fff' }}>
          <h2 style={{ color: '#ff6b6b' }}>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
          <pre style={{ fontSize: '11px', whiteSpace: 'pre-wrap', color: '#aaa', marginTop: '10px' }}>
            {this.state.errorInfo?.componentStack}
          </pre>
          <button style={{ marginTop: '20px', padding: '8px 16px', background: '#00d2ff', border: 'none', color: '#000', cursor: 'pointer' }} onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}>
            Reload Workspace
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default App;
