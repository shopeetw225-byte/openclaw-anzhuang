use crate::{core::platform, OpenClawStatus, SystemInfo};

#[tauri::command]
pub async fn get_system_info() -> SystemInfo {
    platform::collect_system_info()
}

#[tauri::command]
pub async fn get_openclaw_status() -> OpenClawStatus {
    platform::collect_openclaw_status()
}

