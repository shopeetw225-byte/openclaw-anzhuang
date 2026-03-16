use std::{
    env,
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::Duration,
};

use super::platform;

const GATEWAY_PORT: u16 = 18_789;
#[cfg(target_os = "windows")]
const WINDOWS_SERVICE_NAME: &str = "openclaw-gateway";

pub fn is_launchagent_loaded() -> bool {
    #[cfg(target_os = "windows")]
    {
        nssm_service_exists()
    }
    #[cfg(target_os = "macos")]
    {
        let out = Command::new("launchctl").args(["list"]).output().ok();
        let Some(out) = out else { return false };
        String::from_utf8_lossy(&out.stdout)
            .to_lowercase()
            .contains("openclaw")
    }
    #[cfg(target_os = "linux")]
    {
        // Detect systemd user service state
        Command::new("systemctl")
            .args(["--user", "is-active", "openclaw-gateway"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        false
    }
}

/// macOS: returns path to LaunchAgent plist
/// Linux: returns path to systemd user service file
pub fn find_launchagent_plist() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        None
    }
    #[cfg(target_os = "macos")]
    {
        let home = env::var_os("HOME").map(PathBuf::from)?;
        let dir = home.join("Library/LaunchAgents");
        let entries = std::fs::read_dir(dir).ok()?;

        let mut matches: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_file())
            .filter(|p| {
                p.extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.eq_ignore_ascii_case("plist"))
                    == Some(true)
            })
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.to_lowercase().contains("openclaw"))
                    .unwrap_or(false)
            })
            .collect();

        if matches.is_empty() {
            return None;
        }

        matches.sort();
        matches
            .iter()
            .find(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.contains("ai.openclaw.gateway"))
                    .unwrap_or(false)
            })
            .cloned()
            .or_else(|| matches.first().cloned())
    }
    #[cfg(target_os = "linux")]
    {
        let home = env::var_os("HOME").map(PathBuf::from)?;
        let dir = home.join(".config/systemd/user");
        let entries = std::fs::read_dir(dir).ok()?;

        entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_file())
            .filter(|p| {
                p.extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.eq_ignore_ascii_case("service"))
                    == Some(true)
            })
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.to_lowercase().contains("openclaw"))
                    .unwrap_or(false)
            })
            .next()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

pub fn start_gateway() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if run_nssm_success(&["start", WINDOWS_SERVICE_NAME]) {
            return Ok(());
        }

        if run_openclaw_success(&["gateway", "start"]) {
            return Ok(());
        }

        Err("启动 Gateway 失败".to_string())
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(plist) = find_launchagent_plist() {
            let ok = run_command_success("launchctl", &["load", &path_to_arg(&plist)]);
            if ok {
                return Ok(());
            }
        }

        if run_openclaw_success(&["gateway", "start"]) {
            return Ok(());
        }

        Err("启动 Gateway 失败".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        // Try systemd first, then fallback to direct command.
        if run_command_success("systemctl", &["--user", "start", "openclaw-gateway"]) {
            return Ok(());
        }
        if run_openclaw_success(&["gateway", "start"]) {
            return Ok(());
        }
        Err("启动 Gateway 失败".to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("不支持的平台".to_string())
    }
}

pub fn stop_gateway() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut any_ok = false;

        any_ok |= run_nssm_success(&["stop", WINDOWS_SERVICE_NAME]);
        any_ok |= run_openclaw_success(&["gateway", "stop"]);

        thread::sleep(Duration::from_millis(400));

        if gateway_pid().is_none() {
            return Ok(());
        }

        if any_ok {
            return Err("停止 Gateway 未完全成功（进程仍在运行）".to_string());
        }

        Err("停止 Gateway 失败".to_string())
    }
    #[cfg(target_os = "macos")]
    {
        let mut any_ok = false;

        if let Some(plist) = find_launchagent_plist() {
            // Ignore unload failures (best-effort).
            any_ok |= run_command_success("launchctl", &["unload", &path_to_arg(&plist)]);
        }

        any_ok |= run_openclaw_success(&["gateway", "stop"]);

        // Kill the process if still running.
        if let Some(pid) = gateway_pid() {
            let pid_str = pid.to_string();
            any_ok |= run_command_success("kill", &[&pid_str]);
            thread::sleep(Duration::from_millis(200));
        }

        if gateway_pid().is_none() {
            return Ok(());
        }

        if any_ok {
            return Err("停止 Gateway 未完全成功（进程仍在运行）".to_string());
        }

        Err("停止 Gateway 失败".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        let mut any_ok = false;

        any_ok |= run_command_success("systemctl", &["--user", "stop", "openclaw-gateway"]);
        any_ok |= run_openclaw_success(&["gateway", "stop"]);

        if let Some(pid) = gateway_pid() {
            let pid_str = pid.to_string();
            any_ok |= run_command_success("kill", &[&pid_str]);
            thread::sleep(Duration::from_millis(200));
        }

        if gateway_pid().is_none() {
            return Ok(());
        }

        if any_ok {
            return Err("停止 Gateway 未完全成功".to_string());
        }

        Err("停止 Gateway 失败".to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("不支持的平台".to_string())
    }
}

pub fn restart_gateway() -> Result<(), String> {
    let _ = stop_gateway();
    thread::sleep(Duration::from_secs(1));
    start_gateway()
}

pub fn gateway_pid() -> Option<u32> {
    #[cfg(target_os = "windows")]
    {
        let out = Command::new("netstat")
            .args(["-ano", "-p", "tcp"])
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }

        let stdout = String::from_utf8_lossy(&out.stdout);
        let port_suffix = format!(":{GATEWAY_PORT}");

        for line in stdout.lines() {
            let l = line.trim();
            if !l.starts_with("TCP") {
                continue;
            }
            let parts: Vec<&str> = l.split_whitespace().collect();
            if parts.len() < 5 {
                continue;
            }
            let local = parts[1];
            let state = parts[3];
            let pid = parts[4];

            if !state.eq_ignore_ascii_case("LISTENING") {
                continue;
            }
            if !local.ends_with(&port_suffix) {
                continue;
            }
            if let Ok(pid) = pid.parse::<u32>() {
                return Some(pid);
            }
        }

        None
    }
    #[cfg(not(target_os = "windows"))]
    {
        let out = Command::new("lsof")
            .args(["-ti", &format!(":{GATEWAY_PORT}")])
            .output()
            .ok()?;
        let stdout = String::from_utf8_lossy(&out.stdout);
        let first = stdout.lines().next()?.trim();
        first.parse::<u32>().ok()
    }
}

pub fn gateway_uptime_seconds(pid: u32) -> Option<u64> {
    #[cfg(target_os = "windows")]
    {
        let _ = pid;
        None
    }
    #[cfg(not(target_os = "windows"))]
    {
        let out = Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "etime="])
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let s = String::from_utf8_lossy(&out.stdout);
        parse_etime_to_seconds(s.trim())
    }
}

fn run_command_success(cmd: &str, args: &[&str]) -> bool {
    Command::new(cmd)
        .args(args)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// 运行 openclaw 命令，自动解析完整路径并注入 Node bin 到 PATH。
/// 解决打包后 .app 环境中 PATH 受限导致 bare "openclaw" 找不到的问题。
fn run_openclaw_success(args: &[&str]) -> bool {
    let Some(openclaw_path) = platform::resolve_openclaw_path() else {
        return false;
    };
    let mut cmd = Command::new(&openclaw_path);
    cmd.args(args);
    // 注入 node bin 目录，确保 openclaw 内部的 Node.js shebang 能找到 node
    if let Some(node_dir) = platform::node_bin_dir() {
        let base = env::var_os("PATH").unwrap_or_default();
        let mut paths: Vec<PathBuf> = vec![node_dir];
        paths.extend(env::split_paths(&base));
        if let Ok(joined) = env::join_paths(&paths) {
            cmd.env("PATH", joined);
        }
    }
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

fn path_to_arg(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn parse_etime_to_seconds(s: &str) -> Option<u64> {
    // Expected formats:
    //   mm:ss
    //   hh:mm:ss
    //   dd-hh:mm:ss
    let (days, rest) = if let Some((d, r)) = s.split_once('-') {
        (d.parse::<u64>().ok()?, r)
    } else {
        (0, s)
    };

    let parts: Vec<&str> = rest.split(':').collect();
    let (hours, mins, secs) = match parts.len() {
        3 => (
            parts[0].parse::<u64>().ok()?,
            parts[1].parse::<u64>().ok()?,
            parts[2].parse::<u64>().ok()?,
        ),
        2 => (
            0,
            parts[0].parse::<u64>().ok()?,
            parts[1].parse::<u64>().ok()?,
        ),
        1 => (0, 0, parts[0].parse::<u64>().ok()?),
        _ => return None,
    };

    Some(days * 86_400 + hours * 3_600 + mins * 60 + secs)
}

#[cfg(target_os = "windows")]
fn nssm_service_exists() -> bool {
    run_nssm_success(&["status", WINDOWS_SERVICE_NAME])
}

#[cfg(target_os = "windows")]
fn run_nssm_success(args: &[&str]) -> bool {
    let Some(nssm) = find_nssm() else {
        return false;
    };

    Command::new(nssm)
        .args(args)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn find_nssm() -> Option<PathBuf> {
    find_in_path_by_where("nssm.exe")
        .or_else(|| find_in_path_by_where("nssm"))
        .or_else(|| {
            let home = env::var_os("HOME")
                .or_else(|| env::var_os("USERPROFILE"))
                .map(PathBuf::from)?;
            let candidate = home.join(".openclaw/bin/nssm.exe");
            candidate.is_file().then_some(candidate)
        })
}

#[cfg(target_os = "windows")]
fn find_in_path_by_where(name: &str) -> Option<PathBuf> {
    let out = Command::new("where").arg(name).output().ok()?;
    if !out.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    // 优先选择第一个存在且可执行的候选项
    for line in stdout.lines() {
        let path = line.trim();
        if path.is_empty() {
            continue;
        }
        let pb = PathBuf::from(path);
        // 验证文件确实存在
        if pb.is_file() {
            return Some(pb);
        }
    }
    None
}
