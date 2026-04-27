use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

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

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }

    /// Remove a PTY entry and kill its child process. Returns Ok if killed or not found.
    pub fn kill_by_pane_id(&self, pane_id: &str) -> Result<(), String> {
        let mut entries = self.entries.lock().map_err(|e| e.to_string())?;
        if let Some(mut entry) = entries.remove(pane_id) {
            entry.child.kill().map_err(|e| format!("Failed to kill PTY process: {e}"))?;
        }
        Ok(())
    }

    /// Kill all active PTY processes. Called on app exit to prevent orphaned shells.
    pub fn kill_all(&self) {
        if let Ok(mut entries) = self.entries.lock() {
            for (_, mut entry) in entries.drain() {
                let _ = entry.child.kill();
            }
        }
    }
}

#[derive(Clone, Serialize)]
struct PtyOutputPayload {
    pane_id: String,
    data: Vec<u8>,
    /// Monotonically increasing sequence number per reader thread.
    /// Allows the frontend to deduplicate events when the Tauri event
    /// system delivers the same emission more than once.
    seq: u64,
}

#[derive(Clone, Serialize)]
pub struct PtyExitPayload {
    pub pane_id: String,
    pub exit_code: Option<i32>,
}

/// Try to retrieve the exit code from a child process via the managed PtyManager state.
fn harvest_exit_code(handle: &AppHandle, pane_id: &str) -> Option<i32> {
    let pty_mgr = handle.try_state::<PtyManager>()?;
    let mut entries = pty_mgr.entries.lock().ok()?;
    let entry = entries.get_mut(pane_id)?;
    match entry.child.try_wait() {
        Ok(Some(status)) => Some(if status.success() { 0 } else { 1 }),
        _ => None,
    }
}

/// Internal spawn logic shared by `pty_spawn` (Tauri command) and programmatic callers
/// like `swarm_spawn_agent`.
///
/// When `command` is `Some(cmd)`, the shell is invoked with `-c <cmd>` so the process
/// runs the command and then exits naturally. When `None`, a bare interactive shell is spawned.
#[allow(clippy::too_many_arguments)]
pub fn spawn_pty_internal(
    pane_id: String,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    shell: Option<String>,
    command: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    pty_mgr: &PtyManager,
    app_handle: AppHandle,
) -> Result<bool, String> {
    // If a PTY already exists for this pane (e.g. component remount after layout
    // restructure), skip spawning to keep the existing session alive.
    {
        let entries = pty_mgr.entries.lock().map_err(|e| e.to_string())?;
        if entries.contains_key(&pane_id) {
            return Ok(false);
        }
    }

    let pty_system = native_pty_system();
    let cols = cols.unwrap_or(80).max(2);
    let rows = rows.unwrap_or(24).max(2);

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    // Determine shell path: prefer explicit > $SHELL env > platform default
    let shell_path = shell.unwrap_or_else(|| {
        std::env::var("SHELL").unwrap_or_else(|_| {
            if cfg!(target_os = "macos") {
                "/bin/zsh".to_string()
            } else if cfg!(target_os = "windows") {
                std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
            } else {
                "/bin/bash".to_string()
            }
        })
    });

    let mut cmd = CommandBuilder::new(&shell_path);

    // If a command is provided, run it via shell -c
    if let Some(ref command_str) = command {
        cmd.arg("-c");
        cmd.arg(command_str);
    } else {
        // For interactive shells, use login mode (-l) so the shell sources
        // its profile files (.zprofile, .zshrc, .bash_profile, etc.).
        // This is critical on macOS production builds where the app is launched
        // from Finder and doesn't inherit the user's shell environment.
        cmd.arg("-l");
    }

    // Use provided cwd, falling back to the user's home directory.
    // When launched from Finder, the process cwd is "/" which is not useful.
    let effective_cwd = match &cwd {
        Some(dir) if dir != "." && !dir.is_empty() => dir.clone(),
        _ => dirs::home_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("/"))
            .to_string_lossy()
            .into_owned(),
    };
    cmd.cwd(&effective_cwd);

    // Ensure TERM is always set. When the app is launched from Finder / launchd
    // (production builds), the parent environment has no TERM variable. Without
    // TERM, the shell cannot properly configure the PTY (e.g. zsh doesn't
    // disable raw echo when entering zle), causing every character to appear
    // twice: once from PTY echo and once from the shell's line-editor rendering.
    cmd.env("TERM", "xterm-256color");
    // Set COLORTERM so programs can detect true-color support
    cmd.env("COLORTERM", "truecolor");

    // When launched from Finder/Launchpad (production builds), macOS gives the
    // process a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin). This means tools
    // installed via Homebrew, nvm, cargo, go, etc. are not found.
    // Build a comprehensive PATH that covers all common install locations.
    // The user's shell profile (.zshrc) will further extend PATH for interactive
    // shells, but we need the base PATH to be correct so the shell itself can
    // find its plugins and the login process works.
    {
        let home = dirs::home_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("/"))
            .to_string_lossy()
            .into_owned();

        let extra_paths = [
            // Homebrew (Apple Silicon + Intel)
            "/opt/homebrew/bin",
            "/opt/homebrew/sbin",
            "/usr/local/bin",
            "/usr/local/sbin",
            // User-local binaries
            &format!("{home}/.local/bin"),
            // Cargo (Rust)
            &format!("{home}/.cargo/bin"),
            // Go
            &format!("{home}/go/bin"),
            "/usr/local/go/bin",
            // nvm / fnm / volta (Node.js version managers put shims here)
            &format!("{home}/.nvm/versions/node/*/bin"),  // won't glob, but nvm sets PATH in .zshrc
            &format!("{home}/.volta/bin"),
            // pyenv
            &format!("{home}/.pyenv/shims"),
            &format!("{home}/.pyenv/bin"),
            // System paths
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
        ];

        // Start with the current PATH (if any), then prepend the extra paths
        let current_path = std::env::var("PATH").unwrap_or_default();
        let mut all_paths: Vec<&str> = extra_paths.iter().copied().collect();
        if !current_path.is_empty() {
            // Append existing PATH entries that aren't already covered
            for p in current_path.split(':') {
                if !all_paths.contains(&p) {
                    all_paths.push(p);
                }
            }
        }

        cmd.env("PATH", all_paths.join(":"));
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
        let mut entries = pty_mgr.entries.lock().map_err(|e| e.to_string())?;
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
        let mut seq: u64 = 0;
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF — process exited; harvest exit code from child
                    let exit_code = harvest_exit_code(&handle, &reader_pane_id);
                    let _ = handle.emit_to(
                        "main",
                        "pty_exit",
                        PtyExitPayload {
                            pane_id: reader_pane_id.clone(),
                            exit_code,
                        },
                    );
                    break;
                }
                Ok(n) => {
                    seq += 1;
                    let _ = handle.emit_to(
                        "main",
                        "pty_output",
                        PtyOutputPayload {
                            pane_id: reader_pane_id.clone(),
                            data: buf[..n].to_vec(),
                            seq,
                        },
                    );
                }
                Err(_) => {
                    // Read failure — harvest exit code and emit exit event
                    let exit_code = harvest_exit_code(&handle, &reader_pane_id);
                    let _ = handle.emit_to(
                        "main",
                        "pty_exit",
                        PtyExitPayload {
                            pane_id: reader_pane_id.clone(),
                            exit_code,
                        },
                    );
                    break;
                }
            }
        }
    });

    Ok(true)
}

/// Spawn a new PTY process for the given pane.
///
/// - Uses the user's default shell if `shell` is None.
/// - On macOS defaults to /bin/zsh, on Linux /bin/bash.
/// - Spawns a reader thread that streams output via Tauri events.
/// - If a PTY already exists for this pane_id, returns Ok immediately (no-op).
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn pty_spawn(
    pane_id: String,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    shell: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    pty_state: State<'_, PtyManager>,
    app_handle: AppHandle,
) -> Result<bool, String> {
    spawn_pty_internal(
        pane_id,
        cwd,
        env,
        shell,
        None, // no command — interactive shell
        cols,
        rows,
        &pty_state,
        app_handle,
    )
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
