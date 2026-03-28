use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// Holds the writer (for pty_write), the master (for pty_resize),
/// and the child process handle (for pty_kill).
pub struct PtyEntry {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send>,
}

/// Managed state: a map from pane_id to its PtyEntry.
pub struct PtyManager {
    pub entries: Mutex<HashMap<String, PtyEntry>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Clone, Serialize)]
struct PtyOutputPayload {
    pane_id: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct PtyExitPayload {
    pane_id: String,
}

/// Spawn a new PTY process for the given pane.
///
/// - Uses the user's default shell if `shell` is None.
/// - On macOS defaults to /bin/zsh, on Linux /bin/bash.
/// - Spawns a reader thread that streams output via Tauri events.
#[tauri::command]
pub fn pty_spawn(
    pane_id: String,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    shell: Option<String>,
    pty_state: State<'_, PtyManager>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    // Determine shell path
    let shell_path = shell.unwrap_or_else(|| {
        if cfg!(target_os = "macos") {
            "/bin/zsh".to_string()
        } else {
            "/bin/bash".to_string()
        }
    });

    let mut cmd = CommandBuilder::new(&shell_path);

    if let Some(dir) = &cwd {
        cmd.cwd(dir);
    }

    if let Some(env_vars) = &env {
        for (key, value) in env_vars {
            cmd.env(key, value);
        }
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell '{}': {}", shell_path, e))?;

    // Clone reader for the streaming thread
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;

    // Take writer for pty_write
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {e}"))?;

    // Store entry in managed state
    {
        let mut entries = pty_state.entries.lock().map_err(|e| e.to_string())?;
        entries.insert(
            pane_id.clone(),
            PtyEntry {
                writer,
                master: pair.master,
                child,
            },
        );
    }

    // Spawn reader thread for streaming output
    let reader_pane_id = pane_id.clone();
    let handle = app_handle.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF — process exited
                    let _ = handle.emit(
                        "pty_exit",
                        PtyExitPayload {
                            pane_id: reader_pane_id.clone(),
                        },
                    );
                    break;
                }
                Ok(n) => {
                    let _ = handle.emit(
                        "pty_output",
                        PtyOutputPayload {
                            pane_id: reader_pane_id.clone(),
                            data: buf[..n].to_vec(),
                        },
                    );
                }
                Err(_) => {
                    // Read failure — emit exit event
                    let _ = handle.emit(
                        "pty_exit",
                        PtyExitPayload {
                            pane_id: reader_pane_id.clone(),
                        },
                    );
                    break;
                }
            }
        }
    });

    Ok(())
}

/// Write input data to a PTY's master writer.
#[tauri::command]
pub fn pty_write(
    pane_id: String,
    data: Vec<u8>,
    pty_state: State<'_, PtyManager>,
) -> Result<(), String> {
    let mut entries = pty_state.entries.lock().map_err(|e| e.to_string())?;
    let entry = entries
        .get_mut(&pane_id)
        .ok_or_else(|| format!("No PTY found for pane '{pane_id}'"))?;
    entry
        .writer
        .write_all(&data)
        .map_err(|e| format!("Failed to write to PTY: {e}"))?;
    entry
        .writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY writer: {e}"))?;
    Ok(())
}

/// Resize the PTY to the given cols/rows.
#[tauri::command]
pub fn pty_resize(
    pane_id: String,
    cols: u16,
    rows: u16,
    pty_state: State<'_, PtyManager>,
) -> Result<(), String> {
    let entries = pty_state.entries.lock().map_err(|e| e.to_string())?;
    let entry = entries
        .get(&pane_id)
        .ok_or_else(|| format!("No PTY found for pane '{pane_id}'"))?;
    entry
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize PTY: {e}"))?;
    Ok(())
}

/// Kill the child process, remove from map, clean up.
#[tauri::command]
pub fn pty_kill(pane_id: String, pty_state: State<'_, PtyManager>) -> Result<(), String> {
    let mut entries = pty_state.entries.lock().map_err(|e| e.to_string())?;
    let mut entry = entries
        .remove(&pane_id)
        .ok_or_else(|| format!("No PTY found for pane '{pane_id}'"))?;
    entry
        .child
        .kill()
        .map_err(|e| format!("Failed to kill PTY process: {e}"))?;
    Ok(())
}
