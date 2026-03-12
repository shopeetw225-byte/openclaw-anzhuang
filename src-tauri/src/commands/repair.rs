use std::path::PathBuf;
use crate::{DiagnosisItem, RepairResult};

#[tauri::command]
pub async fn run_diagnosis() -> RepairResult {
    let mut items = Vec::new();

    // Check 1: OpenClaw installed
    let openclaw_ok = which("openclaw").is_some();
    items.push(DiagnosisItem {
        check_name: "OpenClaw 安装".to_string(),
        passed: openclaw_ok,
        message: if openclaw_ok {
            "openclaw 命令可用".to_string()
        } else {
            "未找到 openclaw 命令".to_string()
        },
        auto_fixable: false,
    });

    // Check 2: Port 18789
    let port_ok = is_port_open(18_789);
    items.push(DiagnosisItem {
        check_name: "端口 18789".to_string(),
        passed: port_ok,
        message: if port_ok {
            "端口 18789 正在监听".to_string()
        } else {
            "端口 18789 未监听".to_string()
        },
        auto_fixable: true,
    });

    // Check 3: LaunchAgent status
    let la_loaded = crate::core::service_manager::is_launchagent_loaded();
    items.push(DiagnosisItem {
        check_name: "LaunchAgent".to_string(),
        passed: la_loaded,
        message: if la_loaded {
            "LaunchAgent 已加载".to_string()
        } else {
            "LaunchAgent 未加载".to_string()
        },
        auto_fixable: true,
    });

    // Check 4: openclaw.json exists and JSON valid
    let config_ok = check_config_valid();
    items.push(DiagnosisItem {
        check_name: "配置文件".to_string(),
        passed: config_ok,
        message: if config_ok {
            "openclaw.json 格式正确".to_string()
        } else {
            "openclaw.json 不存在或格式错误".to_string()
        },
        auto_fixable: false,
    });

    // Check 5: Recent error log has FATAL
    let log_clean = check_no_recent_fatal();
    items.push(DiagnosisItem {
        check_name: "错误日志".to_string(),
        passed: log_clean,
        message: if log_clean {
            "最近日志无严重错误".to_string()
        } else {
            "日志中存在 FATAL/Error，请查看修复页面".to_string()
        },
        auto_fixable: false,
    });

    let failed = items.iter().filter(|i| !i.passed).count();
    let summary = if failed == 0 {
        "所有检测通过，OpenClaw 运行正常".to_string()
    } else {
        format!("{failed} 项检测未通过")
    };

    RepairResult {
        fixed_count: 0,
        items,
        summary,
    }
}

#[tauri::command]
pub async fn auto_fix() -> RepairResult {
    let mut fixed = 0u32;
    let mut items = Vec::new();

    // Fix 1: Restart Gateway (port not listening)
    let restart_ok = crate::core::service_manager::restart_gateway().is_ok();
    items.push(DiagnosisItem {
        check_name: "重启 Gateway".to_string(),
        passed: restart_ok,
        message: if restart_ok {
            "Gateway 已重启".to_string()
        } else {
            "重启失败".to_string()
        },
        auto_fixable: false,
    });
    if restart_ok {
        fixed += 1;
    }

    // Fix 2: Reload LaunchAgent
    let la_ok = reload_launchagent();
    items.push(DiagnosisItem {
        check_name: "重载 LaunchAgent".to_string(),
        passed: la_ok,
        message: if la_ok {
            "LaunchAgent 已重新加载".to_string()
        } else {
            "LaunchAgent 重载失败（可能不存在 plist）".to_string()
        },
        auto_fixable: false,
    });
    if la_ok {
        fixed += 1;
    }

    let summary = format!("自动修复完成，修复了 {fixed} 项");
    RepairResult {
        fixed_count: fixed,
        items,
        summary,
    }
}

// ─── M5+ OpenClaw 修复命令 ────────────────────────────────────────────────────

/// 运行 `openclaw doctor` —— 官方健康检查 + 自动快速修复
#[tauri::command]
pub async fn run_doctor(app: tauri::AppHandle) -> Result<(), String> {
    let bin = find_openclaw_bin()
        .ok_or_else(|| "找不到 openclaw 命令，请确认 OpenClaw 已安装".to_string())?;
    let bin_str = bin.to_str()
        .ok_or_else(|| "openclaw 路径包含非 UTF-8 字符".to_string())?;
    crate::core::process_runner::stream_command(&app, bin_str, &["doctor"])
}

/// 运行 `openclaw gateway install --force` —— 重新注册开机自启服务
#[tauri::command]
pub async fn run_gateway_reinstall(app: tauri::AppHandle) -> Result<(), String> {
    let bin = find_openclaw_bin()
        .ok_or_else(|| "找不到 openclaw 命令，请确认 OpenClaw 已安装".to_string())?;
    let bin_str = bin.to_str()
        .ok_or_else(|| "openclaw 路径包含非 UTF-8 字符".to_string())?;
    crate::core::process_runner::stream_command(&app, bin_str, &["gateway", "install", "--force"])
}

/// 运行 `openclaw sessions cleanup --enforce --fix-missing` —— 清理孤儿会话
#[tauri::command]
pub async fn run_sessions_cleanup(app: tauri::AppHandle) -> Result<(), String> {
    let bin = find_openclaw_bin()
        .ok_or_else(|| "找不到 openclaw 命令，请确认 OpenClaw 已安装".to_string())?;
    let bin_str = bin.to_str()
        .ok_or_else(|| "openclaw 路径包含非 UTF-8 字符".to_string())?;
    crate::core::process_runner::stream_command(
        &app, bin_str, &["sessions", "cleanup", "--enforce", "--fix-missing"],
    )
}

// --- helpers -----------------------------------------------------------------

/// 查找 openclaw 可执行文件路径（兼容 PATH 受限的打包 app 环境）
fn find_openclaw_bin() -> Option<PathBuf> {
    // 1. 系统 which / where
    #[cfg(target_os = "windows")]
    let out = std::process::Command::new("where").arg("openclaw").output().ok();
    #[cfg(not(target_os = "windows"))]
    let out = std::process::Command::new("which").arg("openclaw").output().ok();
    if let Some(o) = out {
        if o.status.success() {
            let s = String::from_utf8_lossy(&o.stdout);
            let p = s.lines().next().unwrap_or("").trim();
            if !p.is_empty() {
                return Some(PathBuf::from(p));
            }
        }
    }

    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)?;

    #[cfg(target_os = "windows")]
    {
        // 常见 npm 全局 bin：%APPDATA%\npm\openclaw.cmd
        if let Some(appdata) = std::env::var_os("APPDATA").map(PathBuf::from) {
            let p = appdata.join("npm").join("openclaw.cmd");
            if p.is_file() {
                return Some(p);
            }
        }
    }

    // 2. 扫描 ~/node-v* 直接解压安装的 Node.js
    if let Ok(entries) = std::fs::read_dir(&home) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let n = name.to_string_lossy();
            if n.starts_with("node-v") || n.starts_with("node-") {
                let candidate = entry.path().join("bin").join("openclaw");
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    // 3. 解析 ~/.zshrc / ~/.bash_profile 里的 export PATH 行
    let home_str = home.to_string_lossy().to_string();
    let rc_files = [
        home.join(".zshrc"),
        home.join(".zprofile"),
        home.join(".bash_profile"),
        home.join(".bashrc"),
    ];
    for rc in &rc_files {
        let Ok(content) = std::fs::read_to_string(rc) else { continue };
        for line in content.lines() {
            let line = line.trim();
            if !line.starts_with("export PATH") { continue }
            let val = line.splitn(2, '=').nth(1).unwrap_or("")
                .trim_matches('"').trim_matches('\'');
            for seg in val.split(':') {
                let seg = seg.replace("$HOME", &home_str).replace("${HOME}", &home_str);
                if seg.is_empty() || seg.contains('$') { continue }
                let candidate = PathBuf::from(&seg).join("openclaw");
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    // 4. 常见固定路径
    for p in &[
        "/usr/local/bin/openclaw",
        "/opt/homebrew/bin/openclaw",
    ] {
        let pb = PathBuf::from(p);
        if pb.is_file() { return Some(pb); }
    }

    None
}

fn which(cmd: &str) -> Option<PathBuf> {
    // 复用 find_openclaw_bin 的逻辑，但针对任意命令
    #[cfg(target_os = "windows")]
    let out = std::process::Command::new("where").arg(cmd).output().ok();
    #[cfg(not(target_os = "windows"))]
    let out = std::process::Command::new("which").arg(cmd).output().ok();

    let out = out
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").trim().to_string())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from);
    if out.is_some() { return out; }

    // ~/node-v* scan
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)?;
    if let Ok(entries) = std::fs::read_dir(&home) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let n = name.to_string_lossy();
            if n.starts_with("node-v") || n.starts_with("node-") {
                let candidate = entry.path().join("bin").join(cmd);
                if candidate.is_file() { return Some(candidate); }
            }
        }
    }
    None
}

fn is_port_open(port: u16) -> bool {
    use std::{net::SocketAddr, time::Duration};
    std::net::TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], port)), Duration::from_millis(300))
        .is_ok()
}

fn check_config_valid() -> bool {
    let home = match std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        Some(h) => h,
        None => return false,
    };
    let path = std::path::PathBuf::from(home).join(".openclaw").join("openclaw.json");
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .is_some()
}

fn check_no_recent_fatal() -> bool {
    let home = match std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        Some(h) => h,
        None => return true,
    };
    let log = std::path::PathBuf::from(home)
        .join(".openclaw")
        .join("logs")
        .join("gateway.err.log");
    let content = match std::fs::read_to_string(&log) {
        Ok(v) => v,
        Err(_) => return true,
    };
    let recent: Vec<&str> = content.lines().rev().take(30).collect();
    !recent
        .iter()
        .any(|l| l.contains("FATAL") || l.contains("fatal"))
}

fn reload_launchagent() -> bool {
    use crate::core::service_manager::find_launchagent_plist;
    let Some(plist) = find_launchagent_plist() else {
        return false;
    };

    let Some(plist_arg) = plist.to_str() else {
        return false;
    };

    // unload first (ignore error), then load
    let _ = std::process::Command::new("launchctl")
        .args(["unload", plist_arg])
        .output();

    std::process::Command::new("launchctl")
        .args(["load", plist_arg])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
