pub mod commands;
pub mod db;
pub mod file_ops;
pub mod pty_manager;
pub mod types;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data directory");
            std::fs::create_dir_all(&app_data_dir)
                .expect("failed to create app data directory");

            let db_path = app_data_dir.join("turbine.db");
            let init_result =
                db::init_db(&db_path).expect("failed to initialize database");

            if init_result.was_recreated {
                eprintln!(
                    "Warning: database was recreated from scratch (previous DB was corrupt or missing)"
                );
            }

            app.manage(Mutex::new(init_result.connection));
            app.manage(pty_manager::PtyManager::new());

            // Initialize file watcher with the app handle for emitting events
            let file_watcher = file_ops::init_file_watcher(app.handle());
            app.manage(Mutex::new(file_watcher));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_cli_args,
            commands::save_workspace,
            commands::load_workspaces,
            commands::delete_workspace,
            commands::save_task,
            commands::load_tasks,
            commands::delete_task,
            commands::save_agent_preset,
            commands::load_agent_presets,
            commands::delete_agent_preset,
            commands::get_git_diff,
            commands::save_settings,
            commands::load_settings,
            commands::save_theme,
            commands::load_themes,
            pty_manager::pty_spawn,
            pty_manager::pty_write,
            pty_manager::pty_resize,
            pty_manager::pty_kill,
            file_ops::read_file,
            file_ops::write_file,
            file_ops::list_workspace_files,
            file_ops::watch_file,
            file_ops::unwatch_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
