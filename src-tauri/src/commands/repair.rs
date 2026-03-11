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

// --- helpers -----------------------------------------------------------------

fn which(cmd: &str) -> Option<std::path::PathBuf> {
    std::process::Command::new("which")
        .arg(cmd)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .map(std::path::PathBuf::from)
}

fn is_port_open(port: u16) -> bool {
    use std::{net::SocketAddr, time::Duration};
    std::net::TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], port)), Duration::from_millis(300))
        .is_ok()
}

fn check_config_valid() -> bool {
    let home = match std::env::var_os("HOME") {
        Some(h) => h,
        None => return false,
    };
    let path = std::path::PathBuf::from(home).join(".openclaw/openclaw.json");
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .is_some()
}

fn check_no_recent_fatal() -> bool {
    let home = match std::env::var_os("HOME") {
        Some(h) => h,
        None => return true,
    };
    let log = std::path::PathBuf::from(home).join(".openclaw/logs/gateway.err.log");
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
