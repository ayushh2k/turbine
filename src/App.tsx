import { useEffect, useState, useCallback, useMemo, Component, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useWorkspaceStore, createDefaultPane } from './state/workspaceStore';
import { useSettingsStore } from './state/settingsStore';
import { keybindingManager } from './state/keybindingManager';
import { launchAgents } from './state/agentLauncher';
import { applyTheme, getAllThemes } from './themes/themeEngine';
import { navigatePane, findLeafIds, movePane } from './state/layoutEngine';
import { useBroadcast } from './hooks/useBroadcast';
import { usePtyStatusListener } from './hooks/usePtyStatus';
import { TabBar } from './components/TabBar';
import { PaneContainer } from './components/PaneContainer';
import { TemplatePicker } from './components/TemplatePicker';
import { useWorkspaceContextMenu } from './components/WorkspaceContextMenu';
import { CommandPalette, type PaletteAction } from './components/CommandPalette';
import { SettingsPanel } from './components/SettingsPanel';
import { UpdateNotification } from './components/UpdateNotification';
import type { PaneTemplate } from './types';
import {
  applyTemplate,
  splitHorizontal,
  splitVertical,
  closePane,
  resizePane,
} from './state/layoutEngine';
import './App.css';

function App() {
  const [loading, setLoading] = useState(true);
  const [showPalette, setShowPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);
  const { handleContextMenu, menuElement: contextMenuElement } = useWorkspaceContextMenu();

  const {
    workspaces,
    activeWorkspaceId,
    switchWorkspace,
    createWorkspace,
    restoreAll,
    persistAll,
  } = useWorkspaceStore();

  const { settings, loadSettings } = useSettingsStore();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const { broadcastWrite, broadcastMode, toggleBroadcast } = useBroadcast(focusedPaneId);

  // Listen for PTY exit events and track per-pane process status
  usePtyStatusListener();

  // Only pass broadcastWrite when broadcast mode is active
  const activeBroadcastWrite = broadcastMode ? broadcastWrite : undefined;

  // Startup: restore workspaces, settings, apply theme
  useEffect(() => {
    let cancelled = false;
    async function init() {
      await loadSettings();
      await restoreAll();

      if (cancelled) return;

      const { workspaces: ws, activeWorkspaceId: awId } = useWorkspaceStore.getState();
      if (ws.length === 0) {
        createWorkspace('Workspace 1');
      }

      // Apply theme
      const theme = useSettingsStore.getState().settings.theme;
      applyTheme(theme);

      // Auto-launch agents for the active workspace
      const active = useWorkspaceStore.getState().workspaces.find(
        (w) => w.id === (awId ?? useWorkspaceStore.getState().activeWorkspaceId),
      );
      if (active) {
        const errors = await launchAgents(active.panes);
        if (errors.size > 0) {
          console.warn('Agent launch errors:', Object.fromEntries(errors));
        }
      }

      setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Apply theme when it changes
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

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

  // Register keybindings
  useEffect(() => {
    const km = keybindingManager;

    km.register('newWorkspace', () => createWorkspace());
    km.register('closePane', () => {
      if (focusedPaneId) handleClosePane(focusedPaneId);
    });
    km.register('commandPalette', () => setShowPalette((v) => !v));
    km.register('splitHorizontal', () => {
      if (focusedPaneId) handleSplitH(focusedPaneId);
    });
    km.register('splitVertical', () => {
      if (focusedPaneId) handleSplitV(focusedPaneId);
    });
    km.register('toggleBroadcast', toggleBroadcast);
    km.register('openSettings', () => setShowSettings((v) => !v));

    // Workspace navigation
    km.register('nextWorkspace', () => {
      const sorted = [...workspaces].sort((a, b) => a.tabOrder - b.tabOrder);
      const idx = sorted.findIndex((w) => w.id === activeWorkspaceId);
      if (sorted.length > 0) {
        switchWorkspace(sorted[(idx + 1) % sorted.length].id);
      }
    });
    km.register('prevWorkspace', () => {
      const sorted = [...workspaces].sort((a, b) => a.tabOrder - b.tabOrder);
      const idx = sorted.findIndex((w) => w.id === activeWorkspaceId);
      if (sorted.length > 0) {
        switchWorkspace(sorted[(idx - 1 + sorted.length) % sorted.length].id);
      }
    });

    // Direct workspace access (Ctrl+1-9)
    const wsNums = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
    for (const n of wsNums) {
      km.register(`workspace${n}`, () => {
        const sorted = [...workspaces].sort((a, b) => a.tabOrder - b.tabOrder);
        if (sorted[n - 1]) switchWorkspace(sorted[n - 1].id);
      });
    }

    // Directional pane navigation
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
  ]);

  // Command palette actions
  const paletteActions: PaletteAction[] = useMemo(() => {
    const actions: PaletteAction[] = [
      { id: 'new-workspace', label: 'New Workspace', category: 'Workspace', shortcut: 'Ctrl+T', handler: () => createWorkspace() },
      { id: 'toggle-broadcast', label: 'Toggle Broadcast Mode', category: 'Broadcast', shortcut: 'Ctrl+Shift+B', handler: toggleBroadcast },
      { id: 'open-settings', label: 'Open Settings', category: 'App', shortcut: 'Ctrl+,', handler: () => setShowSettings(true) },
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
  }, [workspaces, focusedPaneId, createWorkspace, switchWorkspace, handleSplitH, handleSplitV, handleClosePane, toggleBroadcast]);

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
          {activeWorkspace && (
            <PaneContainer
              layout={activeWorkspace.layout}
              panes={activeWorkspace.panes}
              focusedPaneId={focusedPaneId}
              onFocusPane={setFocusedPaneId}
              onResize={handleResize}
              onSplitH={handleSplitH}
              onSplitV={handleSplitV}
              onClosePane={handleClosePane}
              broadcastWrite={activeBroadcastWrite}
              onPaneConfigChange={handlePaneConfigChange}
              onMovePane={handleMovePane}
              themeId={settings.theme}
            />
          )}
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
