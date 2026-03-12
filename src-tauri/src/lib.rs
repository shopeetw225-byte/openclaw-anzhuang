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
    // ─── M4: Windows support ───────────────────────────────────────────────
    pub powershell_version: Option<String>, // Windows: PowerShell 版本（如 "5.1.22621.2506"）；非 Windows 为 None
    pub wsl_state: Option<String>, // Windows: "available" | "needs_install" | "unsupported" | "unknown"；非 Windows 为 None
    pub wsl_default_distro: Option<String>, // Windows: 默认 distro 名（如 "Ubuntu-22.04"）；非 Windows 为 None
    pub wsl_has_ubuntu: bool, // Windows: 是否检测到 Ubuntu distro；非 Windows 为 false
    pub windows_admin: bool, // Windows: 是否管理员权限；非 Windows 为 false
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
    // Feishu / Lark
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
    // Feishu / Lark
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

// ─── M5: Update ────────────────────────────────────────────────────────────
#[derive(serde::Serialize, serde::Deserialize)]
pub struct UpdateInfo {
    pub current_version: Option<String>, // 本地已安装版本，None 表示未安装
    pub latest_version: Option<String>,  // npm registry 最新版本
    pub update_available: bool,          // latest > current 则为 true
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // tauri_plugin_updater 在正式发布时启用（需要先生成签名密钥）
        // .plugin(tauri_plugin_updater::Builder::new().build())
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
            commands::agent::get_agent_api_key,
            commands::agent::execute_agent_shell,
            commands::agent::execute_agent_sudo_shell,
            commands::agent::get_agent_config,
            commands::agent::save_agent_config,
            commands::channels::test_telegram,
            commands::channels::send_telegram_test_message,
            commands::channels::test_feishu,
            commands::channels::send_feishu_test_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
