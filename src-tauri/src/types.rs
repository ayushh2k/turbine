use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WorkspaceConfig {
    pub id: String,
    pub name: String,
    pub tab_color: Option<String>,
    pub tab_order: i32,
    pub layout_json: String, // serialized LayoutNode
    pub is_active: bool,
    pub board_columns_json: Option<String>,
    pub panes: Vec<PaneConfig>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PaneConfig {
    pub id: String,
    pub workspace_id: String,
    pub pane_type: String, // "home" | "terminal" | "code_viewer" | "media_viewer" | "task_board" | "diff_viewer" | "swarm_panel"
    pub working_directory: Option<String>,
    pub startup_command: Option<String>,
    pub auto_launch: bool,
    pub env_vars: HashMap<String, String>,
    pub label: Option<String>,
    pub title: Option<String>,
    pub task_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppSettings {
    pub theme: String,
    pub default_shell: Option<String>,
    pub agent_launch_delay: u64,
    pub terminal_scrollback_lines: u32,
    pub custom_keybindings: HashMap<String, String>,
    pub auto_update_enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CustomThemeRecord {
    pub id: String,
    pub name: String,
    pub theme_json: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub content: String,
    pub total_size: u64,
    pub offset: u64,
    pub is_complete: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FileTreeEntry {
    pub path: String,
    pub relative_path: String,
    pub is_dir: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: String,
    pub project_path: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String, // "todo" | "in_progress" | "review" | "done"
    pub linked_files_json: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AgentPreset {
    pub id: String,
    pub name: String,
    pub role: String, // "Orchestrator" | "Builder" | "Reviewer" | "Support"
    pub cli_command_template: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SwarmRun {
    pub id: String,
    pub task_id: Option<String>,
    pub project_path: String,
    pub status: String, // "Initializing" | "Running" | "Reviewing" | "Completed" | "Failed" | "Paused"
    pub current_role: Option<String>,
    pub prompt: Option<String>,
    pub started_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SwarmAgent {
    pub id: String,
    pub swarm_run_id: String,
    pub preset_id: Option<String>,
    pub pane_id: String,
    pub role: String,
    pub command: String,
    pub status: String, // "pending" | "running" | "completed" | "failed" | "cancelled"
    pub exit_code: Option<i32>,
    pub output_summary: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WorkflowStep {
    pub id: String,
    pub swarm_run_id: String,
    pub step_order: i32,
    pub preset_id: String,
    pub prompt_override: Option<String>,
    pub depends_on_json: String,
    pub status: String, // "pending" | "running" | "completed" | "failed" | "skipped"
    pub agent_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MailboxMessage {
    pub id: String,
    pub swarm_run_id: String,
    pub sender_role: String,
    pub content: String,
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LogSourceConfig {
    pub id: String,
    pub pane_id: String,
    pub source_type: String,
    pub display_name: String,
    pub color: Option<String>,
    pub params_json: String,
    pub sort_order: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FilterPreset {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub regex_pattern: Option<String>,
    pub levels_json: String,
    pub sources_json: String,
}
