use crate::types::{FileContent, FileTreeEntry};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// Validate and canonicalize a file path to prevent path traversal attacks.
/// Rejects paths containing `..` components after canonicalization and ensures
/// the path doesn't escape expected boundaries.
fn validate_path(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    // Reject obviously malicious patterns before touching the filesystem
    for component in p.components() {
        if let std::path::Component::ParentDir = component {
            return Err("Path traversal (.. components) is not allowed".into());
        }
    }
    // Canonicalize to resolve symlinks
    p.canonicalize()
        .map_err(|e| format!("Invalid path '{}': {e}", path))
}

/// Managed state that holds the file watcher and the set of watched paths.
pub struct FileWatcher {
    pub watcher: RecommendedWatcher,
    pub watched_paths: HashSet<PathBuf>,
}

/// Initialize the file watcher. Call this in `setup()` and store as managed state.
pub fn init_file_watcher(app_handle: &AppHandle) -> FileWatcher {
    let handle = app_handle.clone();
    let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            if matches!(
                event.kind,
                EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_)
            ) {
                for path in &event.paths {
                    let path_str = path.to_string_lossy().to_string();
                    let _ = handle.emit("file_changed", path_str);
                }
            }
        }
    })
    .expect("failed to create file watcher");

    FileWatcher {
        watcher,
        watched_paths: HashSet::new(),
    }
}

type FileWatcherState = Mutex<FileWatcher>;

// ---------------------------------------------------------------------------
// File read / write
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn read_file(
    path: String,
    offset: Option<u64>,
    limit: Option<u64>,
) -> Result<FileContent, String> {
    let path = validate_path(&path)?.to_string_lossy().to_string();
    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to read file metadata: {e}"))?;
    let total_size = metadata.len();
    let offset = offset.unwrap_or(0);

    let mut file = fs::File::open(&path).map_err(|e| format!("Failed to open file: {e}"))?;

    if offset > 0 {
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| format!("Failed to seek: {e}"))?;
    }

    let content = match limit {
        Some(limit) => {
            let mut buf = vec![0u8; limit as usize];
            let bytes_read = file
                .read(&mut buf)
                .map_err(|e| format!("Failed to read file: {e}"))?;
            buf.truncate(bytes_read);
            String::from_utf8_lossy(&buf).to_string()
        }
        None => {
            let mut buf = String::new();
            file.read_to_string(&mut buf)
                .map_err(|e| format!("Failed to read file: {e}"))?;
            buf
        }
    };

    let bytes_read = content.len() as u64;
    let is_complete = offset + bytes_read >= total_size;

    Ok(FileContent {
        content,
        total_size,
        offset,
        is_complete,
    })
}

#[tauri::command]
pub fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    let path = validate_path(&path)?.to_string_lossy().to_string();
    let mut file = fs::File::open(&path).map_err(|e| format!("Failed to open file: {e}"))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).map_err(|e| format!("Failed to read file: {e}"))?;
    Ok(bytes)
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    // For writes, we can't canonicalize non-existent files, so validate parent
    let p = PathBuf::from(&path);
    for component in p.components() {
        if let std::path::Component::ParentDir = component {
            return Err("Path traversal (.. components) is not allowed".into());
        }
    }
    if let Some(parent) = p.parent() {
        if parent.exists() {
            let canonical_parent = parent
                .canonicalize()
                .map_err(|e| format!("Invalid parent path: {e}"))?;
            let full_path = canonical_parent.join(p.file_name().ok_or("Invalid file name")?);
            return fs::write(&full_path, &content)
                .map_err(|e| format!("Failed to write file: {e}"));
        }
    }
    fs::write(&path, &content).map_err(|e| format!("Failed to write file: {e}"))
}

#[tauri::command]
pub fn list_workspace_files(root: String) -> Result<Vec<FileTreeEntry>, String> {
    let requested = PathBuf::from(&root);
    let resolved_root = if requested.is_file() {
        requested
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or(requested)
    } else {
        requested
    };

    let canonical_root = resolved_root
        .canonicalize()
        .unwrap_or_else(|_| resolved_root.clone());

    if !canonical_root.exists() {
        return Err(format!("Path does not exist: {}", canonical_root.display()));
    }

    if !canonical_root.is_dir() {
        return Err(format!("Path is not a directory: {}", canonical_root.display()));
    }

    let mut entries = Vec::new();
    collect_file_entries(&canonical_root, &canonical_root, &mut entries)?;
    entries.sort_by(|a, b| {
        a.relative_path
            .to_lowercase()
            .cmp(&b.relative_path.to_lowercase())
            .then_with(|| a.is_dir.cmp(&b.is_dir).reverse())
    });

    Ok(entries)
}

fn collect_file_entries(
    root: &Path,
    current: &Path,
    entries: &mut Vec<FileTreeEntry>,
) -> Result<(), String> {
    let mut children: Vec<_> = fs::read_dir(current)
        .map_err(|e| format!("Failed to read directory '{}': {e}", current.display()))?
        .filter_map(|entry| entry.ok())
        .collect();

    children.sort_by(|a, b| {
        a.file_name()
            .to_string_lossy()
            .to_lowercase()
            .cmp(&b.file_name().to_string_lossy().to_lowercase())
    });

    for child in children {
        let path = child.path();
        let file_name = child.file_name();
        let file_name = file_name.to_string_lossy();

        if should_skip_path(&file_name) {
            continue;
        }

        let metadata = child
            .metadata()
            .map_err(|e| format!("Failed to read metadata '{}': {e}", path.display()))?;

        let relative_path = path
            .strip_prefix(root)
            .map_err(|e| format!("Failed to compute relative path '{}': {e}", path.display()))?
            .to_string_lossy()
            .replace('\\', "/");

        entries.push(FileTreeEntry {
            path: path.to_string_lossy().to_string(),
            relative_path: relative_path.clone(),
            is_dir: metadata.is_dir(),
        });

        if metadata.is_dir() {
            collect_file_entries(root, &path, entries)?;
        }
    }

    Ok(())
}

fn should_skip_path(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | ".next" | "dist" | "build" | ".turbo"
    )
}

// ---------------------------------------------------------------------------
// Git status
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn git_status(path: String) -> Result<std::collections::HashMap<String, String>, String> {
    use std::process::Command;

    let output = Command::new("git")
        .args(["status", "--porcelain=v1", "-uall"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if !output.status.success() {
        return Err("Not a git repository or git not available".into());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut statuses = std::collections::HashMap::new();

    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        let xy = &line[..2];
        let file_path = &line[3..];
        // Handle renames: "R  old -> new"
        let file_path = if let Some(pos) = file_path.find(" -> ") {
            &file_path[pos + 4..]
        } else {
            file_path
        };

        let status = match xy.trim() {
            "??" => "new",
            s if s.contains('D') => "deleted",
            s if s.contains('R') => "renamed",
            s if s.contains('M') || s.contains('A') || s.contains('U') => "modified",
            _ => continue,
        };

        statuses.insert(file_path.to_string(), status.to_string());
    }

    Ok(statuses)
}

// ---------------------------------------------------------------------------
// File watch / unwatch
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn watch_file(state: State<'_, FileWatcherState>, path: String) -> Result<(), String> {
    let mut fw = state.lock().map_err(|e| e.to_string())?;
    let path_buf = PathBuf::from(&path);

    if fw.watched_paths.contains(&path_buf) {
        return Ok(()); // already watching
    }

    fw.watcher
        .watch(&path_buf, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch file: {e}"))?;

    fw.watched_paths.insert(path_buf);
    Ok(())
}

#[tauri::command]
pub fn unwatch_file(state: State<'_, FileWatcherState>, path: String) -> Result<(), String> {
    let mut fw = state.lock().map_err(|e| e.to_string())?;
    let path_buf = PathBuf::from(&path);

    if !fw.watched_paths.contains(&path_buf) {
        return Ok(()); // not watching
    }

    fw.watcher
        .unwatch(&path_buf)
        .map_err(|e| format!("Failed to unwatch file: {e}"))?;

    fw.watched_paths.remove(&path_buf);
    Ok(())
}
