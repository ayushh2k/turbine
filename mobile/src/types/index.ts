export type LayoutNode =
  | { type: 'leaf'; paneId: string }
  | {
      type: 'split';
      direction: 'horizontal' | 'vertical';
      ratio: number;
      children: [LayoutNode, LayoutNode];
    };

export interface PaneConfig {
  id: string;
  workspaceId: string;
  type: string;
  workingDirectory: string;
  startupCommand: string | null;
  autoLaunch?: boolean;
  label: string | null;
  title: string | null;
  taskId: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  tabColor: string | null;
  layout: LayoutNode;
  panes: PaneConfig[];
}

export interface Task {
  id: string;
  project_path: string;
  title: string;
  description: string | null;
  status: string;
  created_at?: string;
}

export interface SwarmRun {
  id: string;
  task_id: string | null;
  project_path: string;
  status: 'Initializing' | 'Running' | 'Reviewing' | 'Completed' | 'Failed' | 'Paused';
  current_role: string | null;
  prompt: string | null;
  started_at: string | null;
}

export interface SwarmAgent {
  id: string;
  swarm_run_id: string;
  pane_id: string;
  role: string;
  command: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  output_summary: string | null;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type ActiveTab = 'workspace' | 'swarm' | 'tasks' | 'diffs' | 'settings';
