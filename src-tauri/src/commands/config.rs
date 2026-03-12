use crate::{core::config_manager, ConfigSnapshot, SaveConfigPayload};

#[tauri::command]
pub async fn load_config() -> Result<ConfigSnapshot, String> {
    config_manager::load_config_snapshot()
}

#[tauri::command]
pub async fn save_config(config: SaveConfigPayload) -> Result<(), String> {
    config_manager::save_config(config)
}
