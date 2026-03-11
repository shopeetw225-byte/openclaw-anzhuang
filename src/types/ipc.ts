// IPC contract between Rust backend and React frontend
// All Tauri invoke() calls and event types are defined here

export interface SystemInfo {
  os_name: string; // e.g. "macOS 15.2"
  arch: string; // "arm64" | "x86_64"
  node_version: string | null; // e.g. "v22.14.0" or null if not installed
  npm_version: string | null; // e.g. "10.9.2" or null
  openclaw_version: string | null; // e.g. "2026.3.2" or null
  openclaw_installed: boolean;
  gateway_running: boolean;
  gateway_port: number; // always 18789
  homebrew_available: boolean;
  disk_free_mb: number;
  distro_id: string | null; // Linux: "ubuntu" | "debian" | "raspbian" | ...; macOS/Win: null
  systemd_available: boolean; // Linux systemd --user available; always false on macOS
  // ─── M4: Windows support ───────────────────────────────────────────────
  powershell_version?: string | null;
  wsl_state?: string | null; // "available" | "needs_install" | "unsupported" | "unknown"
  wsl_default_distro?: string | null;
  wsl_has_ubuntu?: boolean;
  windows_admin?: boolean;
}

export interface OpenClawStatus {
  installed: boolean;
  version: string | null;
  gateway_running: boolean;
}

export interface InstallLogPayload {
  step: string; // e.g. "Installing Node.js"
  percentage: number; // 0-100
  message: string; // full log line
  timestamp: number; // Unix ms
}

export interface SaveConfigPayload {
  model_primary: string; // e.g. "moonshot/kimi-k2.5"
  api_keys: Record<string, string>; // e.g. { OPENAI_API_KEY: "sk-xxx" }
  telegram_enabled: boolean;
  telegram_bot_token: string;
  telegram_allow_from: number[]; // Telegram user IDs
}

// Tauri IPC commands (use with invoke() from @tauri-apps/api/core)
// invoke<SystemInfo>("get_system_info")
// invoke<void>("run_install", { scriptName: string })  -> emits "install-log" events
// invoke<void>("save_config", { config: SaveConfigPayload })
// invoke<OpenClawStatus>("get_openclaw_status")

// Tauri event: "install-log" -> payload: InstallLogPayload

// ─── M2: Dashboard & Repair types ────────────────────────────────────────────

export interface GatewayDetailedStatus {
  installed: boolean
  version: string | null
  gateway_running: boolean
  gateway_port: number
  gateway_pid: number | null        // process ID, null if not running
  uptime_seconds: number | null     // null if not running
  launchagent_loaded: boolean       // macOS: is LaunchAgent plist loaded
}

export interface LogEntry {
  line: string
}

export interface DiagnosisItem {
  check_name: string      // e.g. "Plugin Paths", "Port 18789", "LaunchAgent"
  passed: boolean
  message: string         // human-readable finding
  auto_fixable: boolean
}

export interface RepairResult {
  fixed_count: number
  items: DiagnosisItem[]
  summary: string
}

// M2 Tauri commands:
// invoke<GatewayDetailedStatus>("get_detailed_status")
// invoke<void>("start_gateway")
// invoke<void>("stop_gateway")
// invoke<void>("restart_gateway")
// invoke<LogEntry[]>("read_logs", { lines: number })
// invoke<RepairResult>("run_diagnosis")
// invoke<RepairResult>("auto_fix")

// ─── M5: Update ────────────────────────────────────────────────────────────

export interface UpdateInfo {
  current_version: string | null  // 本地版本，null = 未安装
  latest_version: string | null   // npm registry 最新版本
  update_available: boolean
}

// M5 新增 Tauri 命令：
// invoke<UpdateInfo>("check_update")          -> 查询版本对比
// invoke<void>("do_update")                   -> 执行更新，流式推送 install-log 事件
