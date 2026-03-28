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
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS panes (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            pane_type TEXT NOT NULL CHECK(pane_type IN ('terminal', 'code_viewer', 'media_viewer')),
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
        ",
    )
}

/// Opens or creates the SQLite database at the given path.
///
/// If the database is corrupt or tables cannot be created, the file is deleted
/// and a fresh database is created. The `was_recreated` flag in the result
/// indicates whether this recovery path was taken.
pub fn init_db(db_path: &Path) -> Result<DbInitResult, String> {
    // First attempt: open existing or create new
    match Connection::open(db_path) {
        Ok(conn) => match create_tables(&conn) {
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
