use crate::types::FileContent;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

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
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Failed to write file: {e}"))
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
