// Workspace
export interface Workspace {
  id: string;
  name: string;
  tabColor: string | null;
  tabOrder: number;
  layout: LayoutNode;
  isActive: boolean;
  panes: PaneConfig[];
}

// Pane configuration
export interface PaneConfig {
  id: string;
  workspaceId: string;
  type: "terminal" | "code_viewer" | "media_viewer" | "task_board";
  workingDirectory: string;
  startupCommand: string | null;
  autoLaunch: boolean;
  envVars: Record<string, string>;
}

// Layout tree node
export type LayoutNode =
  | { type: "leaf"; paneId: string }
  | {
      type: "split";
      direction: "horizontal" | "vertical";
      ratio: number; // 0.0 to 1.0, proportion of first child
      children: [LayoutNode, LayoutNode];
    };

// Pane templates
export type PaneTemplate = 1 | 2 | 4 | 6 | 8 | 10 | 12 | 14 | 16;

// App settings
export interface AppSettings {
  theme: string;
  defaultShell: string | null;
  agentLaunchDelay: number; // milliseconds
  terminalScrollbackLines: number;
  customKeybindings: Record<string, string>;
}

// File content for incremental loading
export interface FileContent {
  content: string;
  totalSize: number;
  offset: number;
  isComplete: boolean;
}

export interface FileTreeEntry {
  path: string;
  relativePath: string;
  isDir: boolean;
}

// Theme definition
export interface ThemeDef {
  id: string;
  name: string;
  colors: {
    background: string;
    foreground: string;
    accent: string;
    tabBar: string;
    paneBorder: string;
    terminal: Record<string, string>;
    codeViewer: Record<string, string>;
  };
}

// Tasks
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';

export interface Task {
  id: string;
  project_path: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  linked_files_json: string;
  created_at?: string;
  updated_at?: string;
}
// Command block (OSC 133)
export interface CommandBlock {
  id: string;
  command: string;
  startLine: number;
  endLine: number;
  exitCode: number | null;
  collapsed: boolean;
}
