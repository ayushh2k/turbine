use rusqlite::{Connection, Result as SqliteResult};
use std::path::Path;

/// Result of database initialization.
pub struct DbInitResult {
    pub connection: Connection,
    /// True if the database was recreated due to corruption or missing file.
    pub was_recreated: bool,
}

/// Creates all required tables in the database.
fn create_tables(conn: &Connection) -> SqliteResult<()> {
    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            tab_color TEXT,
            tab_order INTEGER NOT NULL DEFAULT 0,
            layout_json TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 0,
            board_columns_json TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS panes (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            pane_type TEXT NOT NULL,
            working_directory TEXT,
            startup_command TEXT,
            auto_launch INTEGER NOT NULL DEFAULT 0,
            env_vars_json TEXT,
            label TEXT,
            title TEXT,
            task_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS keybindings (
            action TEXT PRIMARY KEY,
            binding TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS themes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            theme_json TEXT NOT NULL,
            is_builtin INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_path TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'todo',
            linked_files_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_project_path ON tasks(project_path);

        CREATE TABLE IF NOT EXISTS agent_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            cli_command_template TEXT NOT NULL
        );

        INSERT OR IGNORE INTO agent_presets (id, name, role, cli_command_template) VALUES
        ('default_claude', 'Claude Code', 'Builder', 'claude -p \"{{task.title}}. {{task.description}}\"'),
        ('default_gemini', 'Gemini CLI', 'Builder', 'gemini -p \"{{task.title}}. {{task.description}}\"'),
        ('default_codex', 'Codex', 'Builder', 'codex \"{{task.title}}. {{task.description}}\"');

        CREATE TABLE IF NOT EXISTS swarm_runs (
            id TEXT PRIMARY KEY,
            task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
            project_path TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Initializing',
            current_role TEXT,
            prompt TEXT,
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS swarm_agents (
            id TEXT PRIMARY KEY,
            swarm_run_id TEXT NOT NULL REFERENCES swarm_runs(id) ON DELETE CASCADE,
            preset_id TEXT REFERENCES agent_presets(id) ON DELETE SET NULL,
            pane_id TEXT NOT NULL,
            role TEXT NOT NULL,
            command TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            exit_code INTEGER,
            output_summary TEXT,
            started_at TEXT,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS workflow_steps (
            id TEXT PRIMARY KEY,
            swarm_run_id TEXT NOT NULL REFERENCES swarm_runs(id) ON DELETE CASCADE,
            step_order INTEGER NOT NULL,
            preset_id TEXT NOT NULL REFERENCES agent_presets(id) ON DELETE CASCADE,
            prompt_override TEXT,
            depends_on_json TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'pending',
            agent_id TEXT REFERENCES swarm_agents(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS mailbox_messages (
            id TEXT PRIMARY KEY,
            swarm_run_id TEXT NOT NULL REFERENCES swarm_runs(id) ON DELETE CASCADE,
            sender_role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        ",
    )
}

/// Creates the log dashboard tables (log_sources and filter_presets).
fn create_log_dashboard_tables(conn: &Connection) -> SqliteResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS log_sources (
            id TEXT PRIMARY KEY,
            pane_id TEXT NOT NULL,
            source_type TEXT NOT NULL CHECK(source_type IN (
                'local_file', 'docker_container', 'ssh_remote',
                'kubernetes_pod', 'systemd_journal', 'custom_command'
            )),
            display_name TEXT NOT NULL,
            color TEXT,
            params_json TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_log_sources_pane ON log_sources(pane_id);

        CREATE TABLE IF NOT EXISTS filter_presets (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name TEXT NOT NULL,
            regex_pattern TEXT,
            levels_json TEXT NOT NULL DEFAULT '[]',
            sources_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_filter_presets_workspace ON filter_presets(workspace_id);
        ",
    )
}

/// Runs lightweight migrations for schema changes on existing databases.
fn run_migrations(conn: &Connection) -> SqliteResult<()> {
    // Migration 1: Add board_columns_json to workspaces if missing
    let has_col: bool = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('workspaces') WHERE name = 'board_columns_json'")?
        .query_row([], |row| row.get::<_, i64>(0))
        .map(|c| c > 0)
        .unwrap_or(false);

    if !has_col {
        conn.execute_batch("ALTER TABLE workspaces ADD COLUMN board_columns_json TEXT;")?;
    }

    // Migration 2: Make swarm_runs.task_id nullable (recreate table)
    let task_id_notnull: bool = conn
        .prepare("SELECT \"notnull\" FROM pragma_table_info('swarm_runs') WHERE name = 'task_id'")?
        .query_row([], |row| row.get::<_, i64>(0))
        .map(|v| v != 0)
        .unwrap_or(false);

    if task_id_notnull {
        conn.execute_batch(
            "
            CREATE TABLE swarm_runs_new (
                id TEXT PRIMARY KEY,
                task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
                project_path TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('Initializing', 'Running', 'Reviewing', 'Completed', 'Failed')),
                current_role TEXT,
                started_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO swarm_runs_new SELECT * FROM swarm_runs;
            DROP TABLE swarm_runs;
            ALTER TABLE swarm_runs_new RENAME TO swarm_runs;
            "
        )?;
    }

    // Migration 3: Remove CHECK constraint on tasks.status (recreate table)
    // Check if the old CHECK constraint exists by looking at the table SQL
    let table_sql: String = conn
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")?
        .query_row([], |row| row.get::<_, String>(0))
        .unwrap_or_default();

    if table_sql.contains("CHECK") {
        conn.execute_batch(
            "
            CREATE TABLE tasks_new (
                id TEXT PRIMARY KEY,
                project_path TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'todo',
                linked_files_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO tasks_new SELECT * FROM tasks;
            DROP TABLE tasks;
            ALTER TABLE tasks_new RENAME TO tasks;
            CREATE INDEX IF NOT EXISTS idx_tasks_project_path ON tasks(project_path);
            "
        )?;
    }

    // Migration 4: Remove CHECK constraint on agent_presets.role (allow custom roles)
    let presets_sql: String = conn
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_presets'")?
        .query_row([], |row| row.get::<_, String>(0))
        .unwrap_or_default();

    if presets_sql.contains("CHECK") {
        conn.execute_batch(
            "
            CREATE TABLE agent_presets_new (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                cli_command_template TEXT NOT NULL
            );
            INSERT INTO agent_presets_new SELECT * FROM agent_presets;
            DROP TABLE agent_presets;
            ALTER TABLE agent_presets_new RENAME TO agent_presets;
            "
        )?;
    }

    // Migration 5: Add prompt column to swarm_runs and remove CHECK constraint on status
    let swarm_sql: String = conn
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='swarm_runs'")?
        .query_row([], |row| row.get::<_, String>(0))
        .unwrap_or_default();

    let needs_prompt = !swarm_sql.contains("prompt");
    let needs_check_removal = swarm_sql.contains("CHECK");

    if needs_prompt || needs_check_removal {
        conn.execute_batch(
            "
            CREATE TABLE swarm_runs_v2 (
                id TEXT PRIMARY KEY,
                task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
                project_path TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Initializing',
                current_role TEXT,
                prompt TEXT,
                started_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO swarm_runs_v2 (id, task_id, project_path, status, current_role, started_at, updated_at)
                SELECT id, task_id, project_path, status, current_role, started_at, updated_at FROM swarm_runs;
            DROP TABLE swarm_runs;
            ALTER TABLE swarm_runs_v2 RENAME TO swarm_runs;
            "
        )?;
    }

    // Migration 6: Create swarm_agents table if missing
    let has_swarm_agents: bool = conn
        .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='swarm_agents'")?
        .query_row([], |row| row.get::<_, i64>(0))
        .map(|c| c > 0)
        .unwrap_or(false);

    if !has_swarm_agents {
        conn.execute_batch(
            "
            CREATE TABLE swarm_agents (
                id TEXT PRIMARY KEY,
                swarm_run_id TEXT NOT NULL REFERENCES swarm_runs(id) ON DELETE CASCADE,
                preset_id TEXT REFERENCES agent_presets(id) ON DELETE SET NULL,
                pane_id TEXT NOT NULL,
                role TEXT NOT NULL,
                command TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                exit_code INTEGER,
                output_summary TEXT,
                started_at TEXT,
                completed_at TEXT
            );
            "
        )?;
    }

    // Migration 7: Create workflow_steps table if missing
    let has_workflow_steps: bool = conn
        .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='workflow_steps'")?
        .query_row([], |row| row.get::<_, i64>(0))
        .map(|c| c > 0)
        .unwrap_or(false);

    if !has_workflow_steps {
        conn.execute_batch(
            "
            CREATE TABLE workflow_steps (
                id TEXT PRIMARY KEY,
                swarm_run_id TEXT NOT NULL REFERENCES swarm_runs(id) ON DELETE CASCADE,
                step_order INTEGER NOT NULL,
                preset_id TEXT NOT NULL REFERENCES agent_presets(id) ON DELETE CASCADE,
                prompt_override TEXT,
                depends_on_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'pending',
                agent_id TEXT REFERENCES swarm_agents(id) ON DELETE SET NULL
            );
            "
        )?;
    }

    // Migration 8: Add label, title, task_id columns to panes if missing
    let has_label: bool = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('panes') WHERE name = 'label'")?
        .query_row([], |row| row.get::<_, i64>(0))
        .map(|c| c > 0)
        .unwrap_or(false);

    if !has_label {
        conn.execute_batch(
            "
            ALTER TABLE panes ADD COLUMN label TEXT;
            ALTER TABLE panes ADD COLUMN title TEXT;
            ALTER TABLE panes ADD COLUMN task_id TEXT;
            "
        )?;
    }

    // Migration 9: Remove CHECK constraint on panes.pane_type (recreate table).
    // The old constraint rejects newer pane types (e.g. log_dashboard), which
    // made save_workspace fail silently and panes resurrect with stale types
    // after a restart.
    let panes_sql: String = conn
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='panes'")?
        .query_row([], |row| row.get::<_, String>(0))
        .unwrap_or_default();

    if panes_sql.contains("CHECK") {
        conn.execute_batch(
            "
            CREATE TABLE panes_new (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                pane_type TEXT NOT NULL,
                working_directory TEXT,
                startup_command TEXT,
                auto_launch INTEGER NOT NULL DEFAULT 0,
                env_vars_json TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                label TEXT,
                title TEXT,
                task_id TEXT
            );
            INSERT INTO panes_new (id, workspace_id, pane_type, working_directory, startup_command, auto_launch, env_vars_json, created_at, label, title, task_id)
                SELECT id, workspace_id, pane_type, working_directory, startup_command, auto_launch, env_vars_json, created_at, label, title, task_id FROM panes;
            DROP TABLE panes;
            ALTER TABLE panes_new RENAME TO panes;
            CREATE INDEX IF NOT EXISTS idx_panes_workspace ON panes(workspace_id);
            "
        )?;
    }

    Ok(())
}

/// Opens or creates the SQLite database at the given path.
///
/// If the database is corrupt or tables cannot be created, the file is deleted
/// and a fresh database is created. The `was_recreated` flag in the result
/// indicates whether this recovery path was taken.
pub fn init_db(db_path: &Path) -> Result<DbInitResult, String> {
    // First attempt: open existing or create new
    match Connection::open(db_path) {
        Ok(conn) => match create_tables(&conn)
            .and_then(|()| create_log_dashboard_tables(&conn))
            .and_then(|()| run_migrations(&conn))
        {
            Ok(()) => Ok(DbInitResult {
                connection: conn,
                was_recreated: false,
            }),
            Err(_) => recreate_db(db_path),
        },
        Err(_) => recreate_db(db_path),
    }
}

/// Deletes the existing database file and creates a fresh one.
fn recreate_db(db_path: &Path) -> Result<DbInitResult, String> {
    // Remove the corrupt/broken file if it exists
    if db_path.exists() {
        std::fs::remove_file(db_path).map_err(|e| format!("Failed to remove corrupt DB: {e}"))?;
    }

    let conn =
        Connection::open(db_path).map_err(|e| format!("Failed to create fresh DB: {e}"))?;
    create_tables(&conn).map_err(|e| format!("Failed to create tables in fresh DB: {e}"))?;
    create_log_dashboard_tables(&conn)
        .map_err(|e| format!("Failed to create log dashboard tables in fresh DB: {e}"))?;
    run_migrations(&conn).map_err(|e| format!("Failed to run migrations in fresh DB: {e}"))?;

    Ok(DbInitResult {
        connection: conn,
        was_recreated: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init_db_creates_tables() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        let result = init_db(&db_path).unwrap();
        assert!(!result.was_recreated);

        // Verify tables exist by querying them
        let count: i64 = result
            .connection
            .query_row("SELECT COUNT(*) FROM workspaces", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);

        let count: i64 = result
            .connection
            .query_row("SELECT COUNT(*) FROM panes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);

        let count: i64 = result
            .connection
            .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);

        let count: i64 = result
            .connection
            .query_row("SELECT COUNT(*) FROM keybindings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);

        let count: i64 = result
            .connection
            .query_row("SELECT COUNT(*) FROM themes", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_init_db_recreates_on_corrupt() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("corrupt.db");

        // Write garbage to simulate corruption
        std::fs::write(&db_path, b"this is not a valid sqlite database").unwrap();

        let result = init_db(&db_path).unwrap();
        assert!(result.was_recreated);

        // Should still work
        let count: i64 = result
            .connection
            .query_row("SELECT COUNT(*) FROM workspaces", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_init_db_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        // First init
        let r1 = init_db(&db_path).unwrap();
        assert!(!r1.was_recreated);
        drop(r1);

        // Second init on same file should succeed without recreating
        let r2 = init_db(&db_path).unwrap();
        assert!(!r2.was_recreated);
    }

    // -----------------------------------------------------------------------
    // Property-based tests (proptest)
    // -----------------------------------------------------------------------

    use crate::types::{AppSettings, CustomThemeRecord, PaneConfig, WorkspaceConfig};
    use proptest::prelude::*;
    use std::collections::HashMap;

    /// Valid pane types accepted by the CHECK constraint.
    const PANE_TYPES: &[&str] = &[
        "home",
        "terminal",
        "code_viewer",
        "media_viewer",
        "task_board",
        "diff_viewer",
        "swarm_panel",
    ];

    /// Helper: create a fresh in-memory database with all tables.
    fn fresh_db() -> rusqlite::Connection {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("prop.db");
        let result = init_db(&db_path).unwrap();
        // We need to keep the tempdir alive, but since Connection owns the
        // file handle we can leak the dir (tests are short-lived).
        std::mem::forget(dir);
        result.connection
    }

    /// Save a WorkspaceConfig directly via SQL (mirrors commands.rs logic).
    fn save_workspace_sql(
        conn: &rusqlite::Connection,
        ws: &WorkspaceConfig,
    ) -> Result<(), String> {
        conn.execute(
            "INSERT INTO workspaces (id, name, tab_color, tab_order, layout_json, is_active, board_columns_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                tab_color = excluded.tab_color,
                tab_order = excluded.tab_order,
                layout_json = excluded.layout_json,
                is_active = excluded.is_active,
                board_columns_json = excluded.board_columns_json,
                updated_at = datetime('now')",
            rusqlite::params![
                ws.id,
                ws.name,
                ws.tab_color,
                ws.tab_order,
                ws.layout_json,
                ws.is_active as i32,
                ws.board_columns_json,
            ],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "DELETE FROM panes WHERE workspace_id = ?1",
            rusqlite::params![ws.id],
        )
        .map_err(|e| e.to_string())?;

        for pane in &ws.panes {
            let env_json =
                serde_json::to_string(&pane.env_vars).map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO panes (id, workspace_id, pane_type, working_directory, startup_command, auto_launch, env_vars_json, label, title, task_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                rusqlite::params![
                    pane.id,
                    pane.workspace_id,
                    pane.pane_type,
                    pane.working_directory,
                    pane.startup_command,
                    pane.auto_launch as i32,
                    env_json,
                    pane.label,
                    pane.title,
                    pane.task_id,
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    /// Load all workspaces directly via SQL (mirrors commands.rs logic).
    fn load_workspaces_sql(
        conn: &rusqlite::Connection,
    ) -> Result<Vec<WorkspaceConfig>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, tab_color, tab_order, layout_json, is_active, board_columns_json
                 FROM workspaces ORDER BY tab_order",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i32>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i32>(5)?,
                    row.get::<_, Option<String>>(6)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut workspaces = Vec::new();
        for row_result in rows {
            let (id, name, tab_color, tab_order, layout_json, is_active, board_columns_json) =
                row_result.map_err(|e| e.to_string())?;

            let panes = load_panes_sql(conn, &id)?;

            workspaces.push(WorkspaceConfig {
                id,
                name,
                tab_color,
                tab_order,
                layout_json,
                is_active: is_active != 0,
                board_columns_json,
                panes,
            });
        }

        Ok(workspaces)
    }

    fn load_panes_sql(
        conn: &rusqlite::Connection,
        workspace_id: &str,
    ) -> Result<Vec<PaneConfig>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, workspace_id, pane_type, working_directory, startup_command, auto_launch, env_vars_json, label, title, task_id
                 FROM panes WHERE workspace_id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(rusqlite::params![workspace_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, i32>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut panes = Vec::new();
        for pane_result in rows {
            let (id, ws_id, pane_type, working_directory, startup_command, auto_launch, env_vars_json, label, title, task_id) =
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
                label,
                title,
                task_id,
            });
        }

        Ok(panes)
    }

    /// Save settings directly via SQL (mirrors commands.rs logic).
    fn save_settings_sql(
        conn: &rusqlite::Connection,
        settings: &AppSettings,
    ) -> Result<(), String> {
        let pairs: Vec<(&str, String)> = vec![
            ("theme", settings.theme.clone()),
            (
                "default_shell",
                settings.default_shell.clone().unwrap_or_default(),
            ),
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

    /// Load settings directly via SQL (mirrors commands.rs logic).
    fn load_settings_sql(
        conn: &rusqlite::Connection,
    ) -> Result<AppSettings, String> {
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

        let mut kb_stmt = conn
            .prepare("SELECT action, binding FROM keybindings")
            .map_err(|e| e.to_string())?;
        let kb_rows = kb_stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        let mut custom_keybindings = HashMap::new();
        for row in kb_rows {
            let (action, binding) = row.map_err(|e| e.to_string())?;
            custom_keybindings.insert(action, binding);
        }

        Ok(AppSettings {
            theme,
            default_shell,
            agent_launch_delay,
            terminal_scrollback_lines,
            custom_keybindings,
            auto_update_enabled: true,
        })
    }

    /// Save a custom theme directly via SQL.
    fn save_theme_sql(
        conn: &rusqlite::Connection,
        theme: &CustomThemeRecord,
    ) -> Result<(), String> {
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

    /// Load custom themes directly via SQL.
    fn load_themes_sql(
        conn: &rusqlite::Connection,
    ) -> Result<Vec<CustomThemeRecord>, String> {
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

    // -- Proptest strategies ------------------------------------------------

    /// Strategy for a non-empty alphanumeric string (safe for SQL TEXT).
    fn arb_safe_string() -> impl Strategy<Value = String> {
        "[a-zA-Z0-9_]{1,30}"
    }

    /// Strategy for optional safe string.
    fn arb_opt_string() -> impl Strategy<Value = Option<String>> {
        prop::option::of(arb_safe_string())
    }

    /// Strategy for a valid pane_type.
    fn arb_pane_type() -> impl Strategy<Value = String> {
        prop::sample::select(PANE_TYPES).prop_map(|s| s.to_string())
    }

    /// Strategy for a small HashMap<String, String> (env vars).
    fn arb_env_vars() -> impl Strategy<Value = HashMap<String, String>> {
        prop::collection::hash_map(arb_safe_string(), arb_safe_string(), 0..5)
    }

    /// Strategy for a PaneConfig tied to a given workspace_id.
    fn arb_pane_config(workspace_id: String) -> impl Strategy<Value = PaneConfig> {
        (
            arb_safe_string(),      // id
            arb_pane_type(),        // pane_type
            arb_opt_string(),       // working_directory
            arb_opt_string(),       // startup_command
            any::<bool>(),          // auto_launch
            arb_env_vars(),         // env_vars
            arb_opt_string(),       // label
            arb_opt_string(),       // title
            arb_opt_string(),       // task_id
        )
            .prop_map(move |(id, pane_type, wd, cmd, auto_launch, env_vars, label, title, task_id)| {
                PaneConfig {
                    id,
                    workspace_id: workspace_id.clone(),
                    pane_type,
                    working_directory: wd,
                    startup_command: cmd,
                    auto_launch,
                    env_vars,
                    label,
                    title,
                    task_id,
                }
            })
    }

    /// Strategy for a WorkspaceConfig with 0..8 panes.
    fn arb_workspace() -> impl Strategy<Value = WorkspaceConfig> {
        arb_safe_string().prop_flat_map(|ws_id| {
            (
                Just(ws_id.clone()),
                arb_safe_string(),               // name
                arb_opt_string(),                // tab_color
                0..100i32,                       // tab_order
                arb_safe_string(),               // layout_json (opaque JSON blob)
                any::<bool>(),                   // is_active
                arb_opt_string(),                // board_columns_json
                prop::collection::vec(arb_pane_config(ws_id), 0..8),
            )
                .prop_map(
                    |(id, name, tab_color, tab_order, layout_json, is_active, board_columns_json, mut panes)| {
                        // Ensure pane IDs are unique (proptest may generate duplicates)
                        let mut seen = std::collections::HashSet::new();
                        for (i, pane) in panes.iter_mut().enumerate() {
                            if !seen.insert(pane.id.clone()) {
                                pane.id = format!("{}_{}", pane.id, i);
                            }
                        }
                        WorkspaceConfig {
                            id,
                            name,
                            tab_color,
                            tab_order,
                            layout_json,
                            is_active,
                            board_columns_json,
                            panes,
                        }
                    },
                )
        })
    }

    /// Strategy for an AppSettings.
    fn arb_settings() -> impl Strategy<Value = AppSettings> {
        (
            arb_safe_string(),                                                   // theme
            arb_opt_string(),                                                    // default_shell
            0..10000u64,                                                         // agent_launch_delay
            1..100000u32,                                                        // terminal_scrollback_lines
            prop::collection::hash_map(arb_safe_string(), arb_safe_string(), 0..5), // custom_keybindings
            any::<bool>(),                                                       // auto_update_enabled
        )
            .prop_map(
                |(theme, default_shell, delay, scrollback, keybindings, _auto_update)| AppSettings {
                    theme,
                    default_shell,
                    agent_launch_delay: delay,
                    terminal_scrollback_lines: scrollback,
                    custom_keybindings: keybindings,
                    auto_update_enabled: true, // not persisted to settings table, default to true
                },
            )
    }

    /// Strategy for a CustomThemeRecord with a valid JSON object as theme_json.
    fn arb_theme() -> impl Strategy<Value = CustomThemeRecord> {
        (
            arb_safe_string(), // id
            arb_safe_string(), // name
            // Generate a random JSON object with a few keys
            prop::collection::hash_map(arb_safe_string(), arb_safe_string(), 1..8),
        )
            .prop_map(|(id, name, map)| {
                let theme_json = serde_json::to_string(&map).unwrap();
                CustomThemeRecord {
                    id,
                    name,
                    theme_json,
                }
            })
    }

    // -- Property tests -----------------------------------------------------

    proptest! {
        /// Property 1: Workspace persistence round-trip.
        /// Save a random WorkspaceConfig via SQL, load it back, and verify all
        /// fields (including every pane and its env_vars) are identical.
        #[test]
        fn prop_workspace_roundtrip(ws in arb_workspace()) {
            let conn = fresh_db();
            save_workspace_sql(&conn, &ws).unwrap();

            let loaded = load_workspaces_sql(&conn).unwrap();
            prop_assert_eq!(loaded.len(), 1);

            let got = &loaded[0];
            prop_assert_eq!(&got.id, &ws.id);
            prop_assert_eq!(&got.name, &ws.name);
            prop_assert_eq!(&got.tab_color, &ws.tab_color);
            prop_assert_eq!(got.tab_order, ws.tab_order);
            prop_assert_eq!(&got.layout_json, &ws.layout_json);
            prop_assert_eq!(got.is_active, ws.is_active);
            prop_assert_eq!(&got.board_columns_json, &ws.board_columns_json);
            prop_assert_eq!(got.panes.len(), ws.panes.len());

            // Sort panes by id for deterministic comparison (SQL order may vary)
            let mut expected_panes = ws.panes.clone();
            expected_panes.sort_by(|a, b| a.id.cmp(&b.id));
            let mut actual_panes = got.panes.clone();
            actual_panes.sort_by(|a, b| a.id.cmp(&b.id));

            for (exp, act) in expected_panes.iter().zip(actual_panes.iter()) {
                prop_assert_eq!(&act.id, &exp.id);
                prop_assert_eq!(&act.workspace_id, &exp.workspace_id);
                prop_assert_eq!(&act.pane_type, &exp.pane_type);
                prop_assert_eq!(&act.working_directory, &exp.working_directory);
                prop_assert_eq!(&act.startup_command, &exp.startup_command);
                prop_assert_eq!(act.auto_launch, exp.auto_launch);
                prop_assert_eq!(&act.env_vars, &exp.env_vars);
            }
        }

        /// Property 26: Theme JSON round-trip.
        /// Save a random custom theme, load it back, verify all fields match.
        #[test]
        fn prop_theme_roundtrip(theme in arb_theme()) {
            let conn = fresh_db();
            save_theme_sql(&conn, &theme).unwrap();

            let loaded = load_themes_sql(&conn).unwrap();
            prop_assert_eq!(loaded.len(), 1);

            let got = &loaded[0];
            prop_assert_eq!(&got.id, &theme.id);
            prop_assert_eq!(&got.name, &theme.name);
            prop_assert_eq!(&got.theme_json, &theme.theme_json);

            // Also verify the JSON round-trips through serde_json
            let original: serde_json::Value =
                serde_json::from_str(&theme.theme_json).unwrap();
            let loaded_val: serde_json::Value =
                serde_json::from_str(&got.theme_json).unwrap();
            prop_assert_eq!(original, loaded_val);
        }

        /// Property: Settings round-trip.
        /// Save random AppSettings, load them back, verify equivalence.
        /// Note: empty default_shell is stored as "" which loads back as None.
        #[test]
        fn prop_settings_roundtrip(settings in arb_settings()) {
            let conn = fresh_db();
            save_settings_sql(&conn, &settings).unwrap();

            let got = load_settings_sql(&conn).unwrap();

            prop_assert_eq!(&got.theme, &settings.theme);
            // An empty default_shell saves as "" and loads as None (filter)
            let expected_shell = settings.default_shell.as_ref().filter(|s| !s.is_empty()).cloned();
            prop_assert_eq!(&got.default_shell, &expected_shell);
            prop_assert_eq!(got.agent_launch_delay, settings.agent_launch_delay);
            prop_assert_eq!(
                got.terminal_scrollback_lines,
                settings.terminal_scrollback_lines
            );
            prop_assert_eq!(&got.custom_keybindings, &settings.custom_keybindings);
        }

        /// Property: Migration idempotence.
        /// Running init_db twice on the same file produces no errors and
        /// preserves data inserted between the two calls.
        #[test]
        fn prop_migration_idempotence(ws in arb_workspace()) {
            let dir = tempfile::tempdir().unwrap();
            let db_path = dir.path().join("idem.db");

            // First init + insert data
            let r1 = init_db(&db_path).unwrap();
            prop_assert!(!r1.was_recreated);
            save_workspace_sql(&r1.connection, &ws).unwrap();
            drop(r1);

            // Second init on the same file
            let r2 = init_db(&db_path).unwrap();
            prop_assert!(!r2.was_recreated);

            // Data must still be present
            let loaded = load_workspaces_sql(&r2.connection).unwrap();
            prop_assert_eq!(loaded.len(), 1);
            prop_assert_eq!(&loaded[0].id, &ws.id);
            prop_assert_eq!(&loaded[0].name, &ws.name);
            prop_assert_eq!(loaded[0].panes.len(), ws.panes.len());
        }

        /// Property: Workspace delete cascade.
        /// Creating a workspace with panes then deleting the workspace must
        /// also remove all associated panes (ON DELETE CASCADE).
        #[test]
        fn prop_workspace_delete_cascade(ws in arb_workspace()) {
            let conn = fresh_db();
            // Need foreign keys enabled for CASCADE
            conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

            save_workspace_sql(&conn, &ws).unwrap();

            // Verify panes exist
            let pane_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM panes WHERE workspace_id = ?1",
                    rusqlite::params![ws.id],
                    |row| row.get(0),
                )
                .unwrap();
            prop_assert_eq!(pane_count as usize, ws.panes.len());

            // Delete workspace
            conn.execute(
                "DELETE FROM workspaces WHERE id = ?1",
                rusqlite::params![ws.id],
            )
            .unwrap();

            // Workspace gone
            let ws_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM workspaces WHERE id = ?1",
                    rusqlite::params![ws.id],
                    |row| row.get(0),
                )
                .unwrap();
            prop_assert_eq!(ws_count, 0);

            // Panes must also be gone (CASCADE)
            let remaining: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM panes WHERE workspace_id = ?1",
                    rusqlite::params![ws.id],
                    |row| row.get(0),
                )
                .unwrap();
            prop_assert_eq!(remaining, 0);
        }
    }
}
