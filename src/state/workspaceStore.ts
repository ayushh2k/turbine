import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Workspace, PaneConfig, LayoutNode } from '../types';
import { findLeafIds, closePane } from './layoutEngine';

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  broadcastMode: boolean;
  broadcastTargets: Set<string>;

  // Actions
  createWorkspace: (name?: string, preset?: import('./layoutEngine').StarterPreset) => Workspace;
  deleteWorkspace: (id: string) => void;
  duplicateWorkspace: (id: string) => Workspace | null;
  renameWorkspace: (id: string, name: string) => void;
  switchWorkspace: (id: string) => void;
  reorderWorkspaces: (fromIndex: number, toIndex: number) => void;
  setWorkspaceColor: (id: string, color: string) => void;
  setBroadcastMode: (active: boolean) => void;
  setBroadcastTargets: (targets: Set<string>) => void;
  detachPane: (workspaceId: string, paneId: string) => void;
  persistAll: () => Promise<void>;
  restoreAll: () => Promise<void>;
}

function createDefaultPane(workspaceId: string): PaneConfig {
  return {
    id: crypto.randomUUID(),
    workspaceId,
    type: 'terminal',
    workingDirectory: '.',
    startupCommand: null,
    autoLaunch: false,
    envVars: {},
  };
}

function createDefaultWorkspace(name: string): Workspace {
  const id = crypto.randomUUID();
  const pane: PaneConfig = {
    id: crypto.randomUUID(),
    workspaceId: id,
    type: 'home',
    workingDirectory: '.',
    startupCommand: null,
    autoLaunch: false,
    envVars: {},
  };
  const layout: LayoutNode = { type: 'leaf', paneId: pane.id };

  return {
    id,
    name,
    tabColor: null,
    tabOrder: 0,
    layout,
    isActive: false,
    panes: [pane],
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  broadcastMode: false,
  broadcastTargets: new Set<string>(),

  createWorkspace: (name?: string, preset?: import('./layoutEngine').StarterPreset) => {
    const { workspaces } = get();
    const workspaceName = name ?? `Workspace ${workspaces.length + 1}`;
    
    let workspace = createDefaultWorkspace(workspaceName);
    
    if (preset) {
      const panes: PaneConfig[] = preset.panes.map(p => ({
        id: p.id,
        workspaceId: workspace.id,
        type: p.type,
        workingDirectory: '.',
        startupCommand: null,
        autoLaunch: false,
        envVars: {},
      }));
      workspace = {
        ...workspace,
        layout: preset.layout,
        panes,
      };
    }
    
    workspace.tabOrder = workspaces.length;

    set((state) => ({
      workspaces: [...state.workspaces, workspace],
      activeWorkspaceId: workspace.id,
    }));

    return workspace;
  },

  deleteWorkspace: (id: string) => {
    void invoke('delete_workspace', { workspaceId: id }).catch(() => {});

    set((state) => {
      const filtered = state.workspaces.filter((w) => w.id !== id);
      if (filtered.length === 0) {
        const workspace = createDefaultWorkspace('Workspace 1');
        return {
          workspaces: [{ ...workspace, tabOrder: 0 }],
          activeWorkspaceId: workspace.id,
        };
      }

      const reordered = filtered.map((w, i) => ({ ...w, tabOrder: i }));
      let newActiveId = state.activeWorkspaceId;
      if (newActiveId === id) {
        newActiveId = reordered[0].id;
      }
      return { workspaces: reordered, activeWorkspaceId: newActiveId };
    });
  },

  duplicateWorkspace: (id: string) => {
    const { workspaces } = get();
    const source = workspaces.find((w) => w.id === id);
    if (!source) return null;

    const newId = crypto.randomUUID();
    // Deep-clone panes with new IDs and build a paneId mapping
    const paneIdMap = new Map<string, string>();
    const newPanes: PaneConfig[] = source.panes.map((p) => {
      const newPaneId = crypto.randomUUID();
      paneIdMap.set(p.id, newPaneId);
      return { ...p, id: newPaneId, workspaceId: newId };
    });

    // Remap layout pane IDs
    const remapLayout = (node: LayoutNode): LayoutNode => {
      if (node.type === 'leaf') {
        return { type: 'leaf', paneId: paneIdMap.get(node.paneId) ?? node.paneId };
      }
      return {
        type: 'split',
        direction: node.direction,
        ratio: node.ratio,
        children: [remapLayout(node.children[0]), remapLayout(node.children[1])],
      };
    };

    const duplicate: Workspace = {
      ...source,
      id: newId,
      name: `${source.name} (copy)`,
      tabOrder: workspaces.length,
      layout: remapLayout(source.layout),
      panes: newPanes,
    };

    set((state) => ({
      workspaces: [...state.workspaces, duplicate],
    }));

    return duplicate;
  },

  detachPane: (workspaceId: string, paneId: string) => {
    const { workspaces } = get();
    const sourceWs = workspaces.find((w) => w.id === workspaceId);
    if (!sourceWs) return;

    const paneIndex = sourceWs.panes.findIndex((p) => p.id === paneId);
    if (paneIndex === -1) return;
    
    // Don't detach the last pane
    if (sourceWs.panes.length <= 1) return;

    const paneConfig = { ...sourceWs.panes[paneIndex] };

    const newWsId = crypto.randomUUID();
    paneConfig.workspaceId = newWsId;

    const newWorkspace: Workspace = {
      id: newWsId,
      name: `Workspace ${workspaces.length + 1}`,
      tabColor: null,
      tabOrder: workspaces.length,
      layout: { type: 'leaf', paneId: paneConfig.id },
      isActive: false,
      panes: [paneConfig],
    };

    set((state) => ({
      workspaces: [...state.workspaces.map((w) => {
        if (w.id === workspaceId) {
          return {
            ...w,
            panes: w.panes.filter((p) => p.id !== paneId),
            layout: closePane(w.layout, paneId),
          };
        }
        return w;
      }), newWorkspace],
      activeWorkspaceId: newWsId,
    }));
  },

  renameWorkspace: (id: string, name: string) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === id ? { ...w, name } : w
      ),
    }));
  },

  switchWorkspace: (id: string) => {
    set(() => ({ activeWorkspaceId: id }));
  },

  reorderWorkspaces: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const list = [...state.workspaces];
      if (
        fromIndex < 0 || fromIndex >= list.length ||
        toIndex < 0 || toIndex >= list.length ||
        fromIndex === toIndex
      ) {
        return state;
      }
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      const reordered = list.map((w, i) => ({ ...w, tabOrder: i }));
      return { workspaces: reordered };
    });
  },

  setWorkspaceColor: (id: string, color: string) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === id ? { ...w, tabColor: color } : w
      ),
    }));
  },

  setBroadcastMode: (active: boolean) => {
    set(() => ({ broadcastMode: active }));
  },

  setBroadcastTargets: (targets: Set<string>) => {
    set(() => ({ broadcastTargets: targets }));
  },

  persistAll: async () => {
    const { workspaces } = get();
    for (const workspace of workspaces) {
      await invoke('save_workspace', {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          tab_color: workspace.tabColor,
          tab_order: workspace.tabOrder,
          layout_json: JSON.stringify(workspace.layout),
          is_active: workspace.id === get().activeWorkspaceId,
          panes: workspace.panes.map((p) => ({
            id: p.id,
            workspace_id: p.workspaceId,
            pane_type: p.type,
            working_directory: p.workingDirectory,
            startup_command: p.startupCommand,
            auto_launch: p.autoLaunch,
            env_vars: p.envVars,
          })),
        },
      });
    }
  },

  restoreAll: async () => {
    const rawWorkspaces = await invoke<Array<{
      id: string;
      name: string;
      tab_color: string | null;
      tab_order: number;
      layout_json: string;
      is_active: boolean;
      panes: Array<{
        id: string;
        workspace_id: string;
        pane_type: string;
        working_directory: string | null;
        startup_command: string | null;
        auto_launch: boolean;
        env_vars: Record<string, string>;
      }>;
    }>>('load_workspaces');

    const workspaces: Workspace[] = rawWorkspaces.map((raw) => {
      let layout = JSON.parse(raw.layout_json) as LayoutNode;
      let panes = raw.panes.map((p) => ({
        id: p.id,
        workspaceId: p.workspace_id,
        type: p.pane_type as PaneConfig['type'],
        workingDirectory: p.working_directory ?? '.',
        startupCommand: p.startup_command,
        autoLaunch: p.auto_launch,
        envVars: p.env_vars,
      }));

      if (panes.length === 0) {
        const pane = createDefaultPane(raw.id);
        panes = [pane];
        layout = { type: 'leaf', paneId: pane.id };
      } else {
        const leafIds = findLeafIds(layout);
        if (leafIds.length === 0) {
          const pane = panes[0];
          layout = { type: 'leaf', paneId: pane.id };
        } else {
          const paneIds = new Set(panes.map((pane) => pane.id));
          const missingPanes = leafIds
            .filter((paneId) => !paneIds.has(paneId))
            .map((paneId) => ({ ...createDefaultPane(raw.id), id: paneId }));

          panes = [
            ...panes.filter((pane) => leafIds.includes(pane.id)),
            ...missingPanes,
          ];

          if (panes.length === 0) {
            const pane = createDefaultPane(raw.id);
            panes = [pane];
            layout = { type: 'leaf', paneId: pane.id };
          }
        }
      }

      return {
        id: raw.id,
        name: raw.name,
        tabColor: raw.tab_color,
        tabOrder: raw.tab_order,
        layout,
        isActive: raw.is_active,
        panes,
      };
    });

    const activeWs = workspaces.find((w) => w.isActive);
    set({
      workspaces,
      activeWorkspaceId: activeWs?.id ?? (workspaces[0]?.id ?? null),
    });
  },
}));

export { createDefaultWorkspace, createDefaultPane };
