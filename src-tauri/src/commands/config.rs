use crate::{core::config_manager, SaveConfigPayload};

#[tauri::command]
pub async fn save_config(config: SaveConfigPayload) -> Result<(), String> {
    config_manager::save_config(config)
}

