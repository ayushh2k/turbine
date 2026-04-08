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
            pane_type TEXT NOT NULL CHECK(pane_type IN ('home', 'terminal', 'code_viewer', 'media_viewer', 'task_board', 'diff_viewer', 'swarm_panel')),
            working_directory TEXT,
            startup_command TEXT,
            auto_launch INTEGER NOT NULL DEFAULT 0,
            env_vars_json TEXT,
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
        Ok(conn) => match create_tables(&conn).and_then(|()| run_migrations(&conn)) {
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
}
