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
    pub pane_type: String, // "terminal" | "code_viewer" | "media_viewer"
    pub working_directory: Option<String>,
    pub startup_command: Option<String>,
    pub auto_launch: bool,
    pub env_vars: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub theme: String,
    pub auto_update_enabled: bool,
    pub default_shell: Option<String>,
    pub agent_launch_delay: u64,
    pub terminal_scrollback_lines: u32,
    pub custom_keybindings: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct UpdateInfo {
    pub version: String,
    pub summary: String,
    pub download_url: String,
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
