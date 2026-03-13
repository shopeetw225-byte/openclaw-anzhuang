mod commands;
mod core;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SystemInfo {
    pub os_name: String,
    pub arch: String,
    pub node_version: Option<String>,
    pub npm_version: Option<String>,
    pub openclaw_version: Option<String>,
    pub openclaw_installed: bool,
    pub gateway_running: bool,
    pub gateway_port: u16,
    pub homebrew_available: bool,
    pub disk_free_mb: u64,
    pub distro_id: Option<String>,
    pub systemd_available: bool,
    pub powershell_version: Option<String>,
    pub wsl_state: Option<String>,
    pub wsl_default_distro: Option<String>,
    pub wsl_has_ubuntu: bool,
    pub windows_admin: bool,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct OpenClawStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub gateway_running: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct InstallLogPayload {
    pub step: String,
    pub percentage: u8,
    pub message: String,
    pub timestamp: u64,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SaveConfigPayload {
    pub model_primary: String,
    pub api_keys: std::collections::HashMap<String, String>,
    pub telegram_enabled: bool,
    pub telegram_bot_token: String,
    pub telegram_allow_from: Vec<i64>,
    pub feishu_enabled: bool,
    pub feishu_domain: String,
    pub feishu_app_id: String,
    pub feishu_app_secret: String,
    pub feishu_bot_name: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ConfigSnapshot {
    pub model_primary: Option<String>,
    pub telegram_enabled: bool,
    pub telegram_bot_token_set: bool,
    pub telegram_allow_from: Vec<i64>,
    pub env_keys_present: Vec<String>,
    pub feishu_enabled: bool,
    pub feishu_domain: Option<String>,
    pub feishu_app_id_set: bool,
    pub feishu_app_secret_set: bool,
    pub feishu_bot_name: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct GatewayDetailedStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub gateway_running: bool,
    pub gateway_port: u16,
    pub gateway_pid: Option<u32>,
    pub uptime_seconds: Option<u64>,
    pub launchagent_loaded: bool,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct LogEntry {
    pub line: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DiagnosisItem {
    pub check_name: String,
    pub passed: bool,
    pub message: String,
    pub auto_fixable: bool,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct RepairResult {
    pub fixed_count: u32,
    pub items: Vec<DiagnosisItem>,
    pub summary: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct UpdateInfo {
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub update_available: bool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::sysinfo::get_system_info,
            commands::sysinfo::get_openclaw_status,
            commands::installer::run_install,
            commands::installer::run_uninstall,
            commands::config::load_config,
            commands::config::save_config,
            commands::openclaw::get_detailed_status,
            commands::openclaw::start_gateway,
            commands::openclaw::stop_gateway,
            commands::openclaw::restart_gateway,
            commands::openclaw::read_logs,
            commands::repair::run_diagnosis,
            commands::repair::auto_fix,
            commands::repair::run_doctor,
            commands::repair::run_gateway_reinstall,
            commands::repair::run_sessions_cleanup,
            commands::openclaw::check_update,
            commands::openclaw::do_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
