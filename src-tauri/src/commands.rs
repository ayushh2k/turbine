use crate::types::{AppSettings, CustomThemeRecord, PaneConfig, Task, WorkspaceConfig};
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

#[tauri::command]
pub fn get_cli_args() -> Vec<String> {
    std::env::args().collect()
}

type DbState = Mutex<Connection>;

// ---------------------------------------------------------------------------
// Workspace CRUD
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn save_workspace(
    db: State<'_, DbState>,
    workspace: WorkspaceConfig,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // Upsert workspace row
    conn.execute(
        "INSERT INTO workspaces (id, name, tab_color, tab_order, layout_json, is_active, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            tab_color = excluded.tab_color,
            tab_order = excluded.tab_order,
            layout_json = excluded.layout_json,
            is_active = excluded.is_active,
            updated_at = datetime('now')",
        rusqlite::params![
            workspace.id,
            workspace.name,
            workspace.tab_color,
            workspace.tab_order,
            workspace.layout_json,
            workspace.is_active as i32,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Delete existing panes for this workspace, then re-insert
    conn.execute(
        "DELETE FROM panes WHERE workspace_id = ?1",
        rusqlite::params![workspace.id],
    )
    .map_err(|e| e.to_string())?;

    for pane in &workspace.panes {
        let env_json = serde_json::to_string(&pane.env_vars).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO panes (id, workspace_id, pane_type, working_directory, startup_command, auto_launch, env_vars_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                pane.id,
                pane.workspace_id,
                pane.pane_type,
                pane.working_directory,
                pane.startup_command,
                pane.auto_launch as i32,
                env_json,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn load_workspaces(db: State<'_, DbState>) -> Result<Vec<WorkspaceConfig>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, tab_color, tab_order, layout_json, is_active FROM workspaces ORDER BY tab_order",
        )
        .map_err(|e| e.to_string())?;

    let workspace_rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i32>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i32>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut workspaces = Vec::new();

    for row_result in workspace_rows {
        let (id, name, tab_color, tab_order, layout_json, is_active) =
            row_result.map_err(|e| e.to_string())?;

        // Load panes for this workspace
        let panes = load_panes_for_workspace(&conn, &id)?;

        workspaces.push(WorkspaceConfig {
            id,
            name,
            tab_color,
            tab_order,
            layout_json,
            is_active: is_active != 0,
            panes,
        });
    }

    Ok(workspaces)
}

fn load_panes_for_workspace(conn: &Connection, workspace_id: &str) -> Result<Vec<PaneConfig>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, workspace_id, pane_type, working_directory, startup_command, auto_launch, env_vars_json
             FROM panes WHERE workspace_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let pane_rows = stmt
        .query_map(rusqlite::params![workspace_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, i32>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut panes = Vec::new();
    for pane_result in pane_rows {
        let (id, ws_id, pane_type, working_directory, startup_command, auto_launch, env_vars_json) =
            pane_result.map_err(|e| e.to_string())?;

        let env_vars: HashMap<String, String> = env_vars_json
            .as_deref()
            .map(|json| serde_json::from_str(json).unwrap_or_default())
            .unwrap_or_default();

        panes.push(PaneConfig {
            id,
            workspace_id: ws_id,
            pane_type,
            working_directory,
            startup_command,
            auto_launch: auto_launch != 0,
            env_vars,
        });
    }

    Ok(panes)
}

#[tauri::command]
pub fn delete_workspace(db: State<'_, DbState>, workspace_id: String) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    // CASCADE will delete associated panes
    conn.execute(
        "DELETE FROM workspaces WHERE id = ?1",
        rusqlite::params![workspace_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn save_settings(db: State<'_, DbState>, settings: AppSettings) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let pairs: Vec<(&str, String)> = vec![
        ("theme", settings.theme),
        ("default_shell", settings.default_shell.unwrap_or_default()),
        ("agent_launch_delay", settings.agent_launch_delay.to_string()),
        (
            "terminal_scrollback_lines",
            settings.terminal_scrollback_lines.to_string(),
        ),
    ];

    for (key, value) in pairs {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![key, value],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute("DELETE FROM keybindings", [])
        .map_err(|e| e.to_string())?;

    for (action, binding) in &settings.custom_keybindings {
        conn.execute(
            "INSERT INTO keybindings (action, binding) VALUES (?1, ?2)
             ON CONFLICT(action) DO UPDATE SET binding = excluded.binding",
            rusqlite::params![action, binding],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn load_settings(db: State<'_, DbState>) -> Result<AppSettings, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let get = |key: &str| -> Result<Option<String>, String> {
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = ?1")
            .map_err(|e| e.to_string())?;
        let result = stmt
            .query_row(rusqlite::params![key], |row| row.get::<_, String>(0))
            .ok();
        Ok(result)
    };

    let theme = get("theme")?.unwrap_or_else(|| "subnautica".to_string());
    let default_shell = get("default_shell")?.filter(|s| !s.is_empty());
    let agent_launch_delay = get("agent_launch_delay")?
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(500);
    let terminal_scrollback_lines = get("terminal_scrollback_lines")?
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(10000);

    // Load keybindings
    let custom_keybindings = load_keybindings_inner(&conn)?;

    Ok(AppSettings {
        theme,
        default_shell,
        agent_launch_delay,
        terminal_scrollback_lines,
        custom_keybindings,
    })
}

// ---------------------------------------------------------------------------
// Keybindings
// ---------------------------------------------------------------------------

fn load_keybindings_inner(conn: &Connection) -> Result<HashMap<String, String>, String> {
    let mut stmt = conn
        .prepare("SELECT action, binding FROM keybindings")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut map = HashMap::new();
    for row in rows {
        let (action, binding) = row.map_err(|e| e.to_string())?;
        map.insert(action, binding);
    }
    Ok(map)
}

#[tauri::command]
pub fn save_theme(db: State<'_, DbState>, theme: CustomThemeRecord) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO themes (id, name, theme_json, is_builtin) VALUES (?1, ?2, ?3, 0)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            theme_json = excluded.theme_json,
            is_builtin = 0",
        rusqlite::params![theme.id, theme.name, theme.theme_json],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn load_themes(db: State<'_, DbState>) -> Result<Vec<CustomThemeRecord>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, theme_json FROM themes WHERE is_builtin = 0 ORDER BY name")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CustomThemeRecord {
                id: row.get::<_, String>(0)?,
                name: row.get::<_, String>(1)?,
                theme_json: row.get::<_, String>(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut themes = Vec::new();
    for row in rows {
        themes.push(row.map_err(|e| e.to_string())?);
    }

    Ok(themes)
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn save_task(db: State<'_, DbState>, task: Task) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO tasks (id, project_path, title, description, status, linked_files_json, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
            project_path = excluded.project_path,
            title = excluded.title,
            description = excluded.description,
            status = excluded.status,
            linked_files_json = excluded.linked_files_json,
            updated_at = datetime('now')",
        rusqlite::params![
            task.id,
            task.project_path,
            task.title,
            task.description,
            task.status,
            task.linked_files_json,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn load_tasks(db: State<'_, DbState>, project_path: String) -> Result<Vec<Task>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare(
            "SELECT id, project_path, title, description, status, linked_files_json, created_at, updated_at 
             FROM tasks 
             WHERE project_path = ?1 
             ORDER BY updated_at DESC"
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![project_path], |row| {
            Ok(Task {
                id: row.get::<_, String>(0)?,
                project_path: row.get::<_, String>(1)?,
                title: row.get::<_, String>(2)?,
                description: row.get::<_, Option<String>>(3)?,
                status: row.get::<_, String>(4)?,
                linked_files_json: row.get::<_, String>(5)?,
                created_at: row.get::<_, Option<String>>(6)?,
                updated_at: row.get::<_, Option<String>>(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for row in rows {
        tasks.push(row.map_err(|e| e.to_string())?);
    }

    Ok(tasks)
}

#[tauri::command]
pub fn delete_task(db: State<'_, DbState>, task_id: String) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM tasks WHERE id = ?1",
        rusqlite::params![task_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

