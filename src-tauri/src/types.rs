use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone)]
pub struct WorkspaceConfig {
    pub id: String,
    pub name: String,
    pub tab_color: Option<String>,
    pub tab_order: i32,
    pub layout_json: String, // serialized LayoutNode
    pub is_active: bool,
    pub panes: Vec<PaneConfig>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PaneConfig {
    pub id: String,
    pub workspace_id: String,
    pub pane_type: String, // "terminal" | "code_viewer" | "media_viewer" | "task_board"
    pub working_directory: Option<String>,
    pub startup_command: Option<String>,
    pub auto_launch: bool,
    pub env_vars: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub theme: String,
    pub default_shell: Option<String>,
    pub agent_launch_delay: u64,
    pub terminal_scrollback_lines: u32,
    pub custom_keybindings: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CustomThemeRecord {
    pub id: String,
    pub name: String,
    pub theme_json: String,
}

#[derive(Serialize, Deserialize, Clone)]
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
    pub task_id: String,
    pub project_path: String,
    pub status: String, // "Initializing" | "Running" | "Reviewing" | "Completed" | "Failed"
    pub current_role: Option<String>,
    pub started_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MailboxMessage {
    pub id: String,
    pub swarm_run_id: String,
    pub sender_role: String,
    pub content: String,
    pub created_at: Option<String>,
}
