// Board column definition for custom TaskBoard columns
export interface BoardColumn {
  id: string;
  label: string;
}

// Workspace
export interface Workspace {
  id: string;
  name: string;
  tabColor: string | null;
  tabOrder: number;
  layout: LayoutNode;
  isActive: boolean;
  boardColumns: BoardColumn[] | null;
  panes: PaneConfig[];
}

// Pane configuration
export interface PaneConfig {
  id: string;
  workspaceId: string;
  type: "home" | "terminal" | "code_viewer" | "media_viewer" | "task_board" | "diff_viewer" | "swarm_panel" | "log_dashboard";
  workingDirectory: string;
  startupCommand: string | null;
  autoLaunch: boolean;
  envVars: Record<string, string>;
  label: string | null;
  title: string | null;
  taskId: string | null;
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
  autoUpdateEnabled: boolean;
}

// Update info returned by the check_for_updates command
export interface UpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
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

// Tasks — status is a free-form string so workspaces can define custom columns
export type TaskStatus = string;

export const DEFAULT_BOARD_COLUMNS: BoardColumn[] = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
];

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

// Agent Presets — role is free-form so users can assign any role to any agent
export type AgentRole = string;

export const DEFAULT_AGENT_ROLES = ['Orchestrator', 'Builder', 'Reviewer', 'Support'] as const;

export interface AgentPreset {
  id: string;
  name: string;
  role: AgentRole;
  cli_command_template: string;
}
// Swarm orchestration
export type SwarmStatus = 'Initializing' | 'Running' | 'Reviewing' | 'Completed' | 'Failed' | 'Paused';

export interface SwarmRun {
  id: string;
  task_id: string | null;
  project_path: string;
  status: SwarmStatus;
  current_role: string | null;
  prompt: string | null;
  started_at: string | null;
  updated_at: string | null;
}

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SwarmAgent {
  id: string;
  swarm_run_id: string;
  preset_id: string | null;
  pane_id: string;
  role: string;
  command: string;
  status: AgentStatus;
  exit_code: number | null;
  output_summary: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkflowStep {
  id: string;
  swarm_run_id: string;
  step_order: number;
  preset_id: string;
  prompt_override: string | null;
  depends_on_json: string;
  status: string;
  agent_id: string | null;
}

export interface MailboxMessage {
  id: string;
  swarm_run_id: string;
  sender_role: string;
  content: string;
  created_at: string | null;
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


// ─── Log Dashboard Types ────────────────────────────────────────────────────

// Log source types
export type LogSourceType =
  | 'local_file'
  | 'docker_container'
  | 'ssh_remote'
  | 'kubernetes_pod'
  | 'systemd_journal'
  | 'custom_command';

// Source-specific parameters
export interface LocalFileParams {
  filePath: string;
}

export interface DockerContainerParams {
  containerNameOrId: string;
  tail?: number;
}

export interface SshRemoteParams {
  host: string;
  remoteFilePath: string;
  user?: string;
  port?: number;
  identityFile?: string;
}

export interface KubernetesPodParams {
  podName: string;
  namespace?: string;
  containerName?: string;
  tail?: number;
}

export interface SystemdJournalParams {
  unitName: string;
  lines?: number;
}

export interface CustomCommandParams {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
}

export type LogSourceParams =
  | LocalFileParams
  | DockerContainerParams
  | SshRemoteParams
  | KubernetesPodParams
  | SystemdJournalParams
  | CustomCommandParams;

// Log source configuration
export interface LogSourceConfig {
  id: string;
  paneId: string;
  sourceType: LogSourceType;
  displayName: string;
  color: string | null;
  params: LogSourceParams;
  sortOrder: number;
}

// Log levels
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

// Parsed log entry
export interface LogEntry {
  id: string;
  sourceId: string;
  sourceLabel: string;
  sourceColor: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  rawText: string;
}

// Timestamp display formats
export type TimestampFormat = 'HH:mm:ss.SSS' | 'HH:mm:ss' | 'ISO' | 'relative';

// Filter preset (persisted)
export interface FilterPreset {
  id: string;
  workspaceId: string;
  name: string;
  regexPattern: string | null;
  levels: LogLevel[];
  sources: string[];
}

// Filter state (in-memory)
export interface FilterState {
  regex: string | null;
  levels: Set<LogLevel>;
  sources: Set<string>;
}

// Source status tracking
export type SourceStatus = 'running' | 'stopped' | 'error' | 'connecting';

export interface SourceStatusEntry {
  sourceId: string;
  syntheticPaneId: string;
  status: SourceStatus;
  errorMessage?: string;
}

// Dashboard pane state (in-memory, per-pane)
export interface DashboardPaneState {
  sources: LogSourceConfig[];
  filter: FilterState;
  isPaused: boolean;
  pausedEntryCount: number;
  autoScroll: boolean;
  expandedEntryIds: Set<string>;
}
