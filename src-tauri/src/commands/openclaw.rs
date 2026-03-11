use std::path::{Path, PathBuf};

use crate::{
    core::{service_manager},
    GatewayDetailedStatus, LogEntry,
};

#[tauri::command]
pub async fn get_detailed_status() -> GatewayDetailedStatus {
    let node_path = resolve_node_path();
    let openclaw_path = resolve_openclaw_path(&node_path);

    let installed = openclaw_path.is_some();
    let version = openclaw_path
        .as_deref()
        .and_then(|p| run_cmd(p, &["--version"]));

    let pid = service_manager::gateway_pid();
    let gateway_running = pid.is_some();
    let uptime_seconds = pid.and_then(service_manager::gateway_uptime_seconds);
    let launchagent_loaded = service_manager::is_launchagent_loaded();

    GatewayDetailedStatus {
        installed,
        version,
        gateway_running,
        gateway_port: 18_789,
        gateway_pid: pid,
        uptime_seconds,
        launchagent_loaded,
    }
}

#[tauri::command]
pub async fn start_gateway() -> Result<(), String> {
    service_manager::start_gateway()
}

#[tauri::command]
pub async fn stop_gateway() -> Result<(), String> {
    service_manager::stop_gateway()
}

#[tauri::command]
pub async fn restart_gateway() -> Result<(), String> {
    service_manager::restart_gateway()
}

#[tauri::command]
pub async fn read_logs(lines: usize) -> Vec<LogEntry> {
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
    let Some(home) = home else { return Vec::new() };

    let log_path = home.join(".openclaw/logs/gateway.err.log");
    let content = match std::fs::read_to_string(&log_path) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    content
        .lines()
        .rev()
        .take(lines.max(1).min(500))
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|l| LogEntry { line: l.to_string() })
        .collect()
}

fn run_cmd(path: &Path, args: &[&str]) -> Option<String> {
    std::process::Command::new(path)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
}

fn resolve_node_path() -> Option<PathBuf> {
    which("node")
}

fn resolve_openclaw_path(_node_path: &Option<PathBuf>) -> Option<PathBuf> {
    which("openclaw")
}

fn which(cmd: &str) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let out = std::process::Command::new("where")
            .arg(cmd)
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&out.stdout);
        let first = stdout.lines().next()?.trim();
        if first.is_empty() {
            return None;
        }
        Some(PathBuf::from(first))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let out = std::process::Command::new("which")
            .arg(cmd)
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&out.stdout);
        let first = stdout.lines().next()?.trim();
        if first.is_empty() {
            return None;
        }
        Some(PathBuf::from(first))
    }
}

// ─── M5: Update ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_update() -> Result<crate::UpdateInfo, String> {
    // 获取本地版本
    let current_version = which("openclaw").and_then(|p| {
        run_cmd(&p, &["--version"]).map(|v| {
            // openclaw --version 可能输出 "openclaw/2026.3.2 darwin-arm64 node-v22.x"
            // 取第一个 token，再去掉可能的 "openclaw/" 前缀
            let token = v.split_whitespace().next().unwrap_or(&v).to_string();
            token
                .strip_prefix("openclaw/")
                .unwrap_or(&token)
                .to_string()
        })
    });

    // 查询 npm registry 最新版本（等价于 npm view openclaw version）
    let npm_out = std::process::Command::new("npm")
        .args(["view", "openclaw", "version"])
        .output()
        .map_err(|e| format!("无法查询 npm registry: {e}"))?;

    let latest_version = if npm_out.status.success() {
        let s = String::from_utf8_lossy(&npm_out.stdout).trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    } else {
        let err = String::from_utf8_lossy(&npm_out.stderr).trim().to_string();
        return Err(format!("npm view 失败: {err}"));
    };

    let update_available = match (&current_version, &latest_version) {
        (Some(cur), Some(lat)) => cur != lat,
        _ => false,
    };

    Ok(crate::UpdateInfo {
        current_version,
        latest_version,
        update_available,
    })
}

#[tauri::command]
pub async fn do_update(app: tauri::AppHandle) -> Result<(), String> {
    // 使用流式执行器，实时推送 install-log 事件给前端进度条
    crate::core::process_runner::stream_command(&app, "npm", &["update", "-g", "openclaw"])
}
