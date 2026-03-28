use crate::types::UpdateInfo;

// ---------------------------------------------------------------------------
// Auto-update stubs
// These are placeholder implementations until we have a release server
// and wire up tauri-plugin-updater.
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn check_for_updates() -> Result<Option<UpdateInfo>, String> {
    // No update server configured yet — always returns None.
    Ok(None)
}

#[tauri::command]
pub fn install_update() -> Result<(), String> {
    Err("No update available".to_string())
}
