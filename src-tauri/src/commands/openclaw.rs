use std::{
    cmp::Ordering,
    path::{Path, PathBuf},
};

use crate::{
    core::{platform, service_manager},
    GatewayDetailedStatus, LogEntry,
};

#[tauri::command]
pub async fn get_detailed_status() -> GatewayDetailedStatus {
    let node_path = platform::resolve_node_path();
    let node_bin_dir = node_path.as_deref().and_then(|p| p.parent());
    let openclaw_path = platform::resolve_openclaw_path();

    let installed = openclaw_path.is_some();
    let version = openclaw_path
        .as_deref()
        .and_then(|p| run_cmd(p, &["--version"], node_bin_dir));

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
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(std::path::PathBuf::from);
    let Some(home) = home else { return Vec::new() };

    let log_path = home.join(".openclaw").join("logs").join("gateway.err.log");
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

fn run_cmd(path: &Path, args: &[&str], node_bin_dir: Option<&Path>) -> Option<String> {
    let mut cmd = build_command_for_path(path);
    cmd.args(args);
    inject_node_path(&mut cmd, node_bin_dir);

    cmd.output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
}

fn build_command_for_path(path: &Path) -> std::process::Command {
    #[cfg(target_os = "windows")]
    {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ext == "cmd" || ext == "bat" {
            let mut c = std::process::Command::new("cmd");
            c.arg("/C").arg(path);
            return c;
        }
    }

    std::process::Command::new(path)
}

fn inject_node_path(command: &mut std::process::Command, node_bin_dir: Option<&Path>) {
    let Some(dir) = node_bin_dir else { return };

    let base = std::env::var_os("PATH").unwrap_or_default();
    let mut paths: Vec<PathBuf> = Vec::new();
    paths.push(dir.to_path_buf());
    paths.extend(std::env::split_paths(&base));
    if let Ok(joined) = std::env::join_paths(paths) {
        command.env("PATH", joined);
    } else {
        let sep = if cfg!(windows) { ";" } else { ":" };
        command.env("PATH", format!("{}{}{}", dir.display(), sep, base.to_string_lossy()));
    }
}

fn extract_openclaw_version(raw: &str) -> Option<String> {
    let token = raw.split_whitespace().next().unwrap_or(raw).trim();
    if token.is_empty() {
        return None;
    }

    let token = token.strip_prefix("openclaw/").unwrap_or(token);
    let token = token.strip_prefix('v').unwrap_or(token);
    let token = token.trim();
    if token.is_empty() { None } else { Some(token.to_string()) }
}

fn parse_semver_3(version: &str) -> Option<(u64, u64, u64)> {
    let v = version.trim();
    if v.is_empty() {
        return None;
    }

    let v = v.strip_prefix('v').unwrap_or(v);
    let v = v.split_whitespace().next().unwrap_or(v);
    let v = v.split('-').next().unwrap_or(v);
    let mut parts = v.split('.');

    let major: u64 = parts.next()?.trim().parse().ok()?;
    let minor: u64 = parts.next().unwrap_or("0").trim().parse().ok()?;
    let patch: u64 = parts.next().unwrap_or("0").trim().parse().ok()?;
    Some((major, minor, patch))
}

fn is_newer_version(latest: &str, current: &str) -> Option<bool> {
    let lat = parse_semver_3(latest)?;
    let cur = parse_semver_3(current)?;
    Some(lat.cmp(&cur) == Ordering::Greater)
}

// ─── M5: Update ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_update() -> Result<crate::UpdateInfo, String> {
    let node_path = platform::resolve_node_path();
    let node_bin_dir = node_path.as_deref().and_then(|p| p.parent());

    // 获取本地版本（可能为 None：未安装或 PATH/Node 不可用）
    let current_version = platform::resolve_openclaw_path()
        .as_deref()
        .and_then(|p| run_cmd(p, &["--version"], node_bin_dir))
        .and_then(|v| extract_openclaw_version(&v));

    // 查询 npm registry 最新版本（等价于 npm view openclaw version）
    let npm_path = platform::resolve_npm_path()
        .ok_or_else(|| "未检测到 npm，请先安装 Node.js（或修复 PATH）".to_string())?;
    let npm_out = {
        let mut cmd = build_command_for_path(&npm_path);
        cmd.args(["view", "openclaw", "version"]);
        inject_node_path(&mut cmd, node_bin_dir);
        cmd.output()
            .map_err(|e| format!("无法查询 npm registry: {e}"))?
    };

    let latest_version = if npm_out.status.success() {
        let s = String::from_utf8_lossy(&npm_out.stdout).trim().to_string();
        if s.is_empty() { None } else { Some(s) }
    } else {
        let err = String::from_utf8_lossy(&npm_out.stderr).trim().to_string();
        let out = String::from_utf8_lossy(&npm_out.stdout).trim().to_string();
        let detail = if !err.is_empty() { err } else if !out.is_empty() { out } else { npm_out.status.to_string() };
        return Err(format!("npm view 失败: {detail}"));
    };

    let update_available = match (&current_version, &latest_version) {
        (None, Some(_)) => true,
        (Some(cur), Some(lat)) => is_newer_version(lat, cur).unwrap_or_else(|| cur.trim() != lat.trim()),
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
    let npm_path = platform::resolve_npm_path()
        .ok_or_else(|| "未检测到 npm，请先安装 Node.js（或修复 PATH）".to_string())?;
    let program = npm_path.to_string_lossy().to_string();
    crate::core::process_runner::stream_command(&app, &program, &["install", "-g", "openclaw@latest"])
}
