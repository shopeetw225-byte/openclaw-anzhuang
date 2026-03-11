# M2 Agent 2 任务：Rust 后端（服务控制 + 诊断修复）

## 你的角色
你负责实现 Gateway 启停控制、LaunchAgent 管理、日志读取、诊断修复的 Rust 后端。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src-tauri/src/core/service_manager.rs`（新建）
- `src-tauri/src/core/mod.rs`（追加 pub mod）
- `src-tauri/src/commands/openclaw.rs`（新建）
- `src-tauri/src/commands/repair.rs`（新建）
- `src-tauri/src/commands/mod.rs`（追加 pub mod）
- `src-tauri/src/lib.rs`（追加类型 + 注册命令）

## 工作规则
- 执行 cargo 命令前：`export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- 不修改已有的 core/*.rs 和 commands/*.rs（M1 文件）

---

## IPC 契约（严格遵守，与 src/types/ipc.ts 一致）

在 `lib.rs` 追加以下类型（**追加**，不替换已有类型）：

```rust
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
```

---

## 任务 1：core/service_manager.rs

管理 macOS LaunchAgent，并控制 Gateway 启停。

**关键函数：**

```rust
// 检测 LaunchAgent plist 是否已加载
// 命令：launchctl list | grep openclaw → 有输出即已加载
pub fn is_launchagent_loaded() -> bool

// 找到 plist 文件路径（搜索常见位置）
// ~/Library/LaunchAgents/ 下匹配 *openclaw*.plist
pub fn find_launchagent_plist() -> Option<std::path::PathBuf>

// 启动 Gateway
// 先尝试 launchctl load <plist>，失败则直接 openclaw gateway start
pub fn start_gateway() -> Result<(), String>

// 停止 Gateway
// launchctl unload <plist> 或 openclaw gateway stop，然后 kill <pid>
pub fn stop_gateway() -> Result<(), String>

// 重启 Gateway
// stop + 等 1s + start
pub fn restart_gateway() -> Result<(), String>

// 获取 Gateway PID（如果运行中）
// lsof -ti :18789 → 第一行解析为 PID
pub fn gateway_pid() -> Option<u32>

// 获取进程启动时间（uptime），通过 ps -p <pid> -o etime= 解析
// 返回秒数
pub fn gateway_uptime_seconds(pid: u32) -> Option<u64>
```

**注意**：所有命令调用用 `std::process::Command`，用 `|| true` 容忍失败。

## 任务 2：core/mod.rs 追加

```rust
pub mod service_manager;
```

## 任务 3：commands/openclaw.rs

> ⚠️ **坑已修复**：`platform.rs` 里的 `resolve_node()` / `resolve_openclaw()` 是**私有函数**，
> 不要写 `platform::resolve_node_path()` 或 `platform::resolve_openclaw_path()`（这两个函数不存在）。
> `get_detailed_status` 里直接用下方定义的 `find_openclaw()` 辅助函数。

```rust
use crate::{core::service_manager, GatewayDetailedStatus, LogEntry};

#[tauri::command]
pub async fn get_detailed_status() -> GatewayDetailedStatus {
    let openclaw_path = find_openclaw();

    let installed = openclaw_path.is_some();
    let version = openclaw_path.as_deref()
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
    // 读取 ~/.openclaw/logs/gateway.err.log 最后 N 行
    // 用 std::fs::read_to_string + split('\n').rev().take(lines).rev()
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

fn run_cmd(path: &std::path::Path, args: &[&str]) -> Option<String> {
    std::process::Command::new(path)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
}

fn find_openclaw() -> Option<std::path::PathBuf> {
    // 1. which
    if let Some(p) = std::process::Command::new("which")
        .arg("openclaw")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| std::path::PathBuf::from(String::from_utf8_lossy(&o.stdout).trim()))
    {
        if p.is_file() { return Some(p); }
    }
    // 2. 常见固定路径
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
    let mut candidates = vec![
        std::path::PathBuf::from("/usr/local/bin/openclaw"),
        std::path::PathBuf::from("/opt/homebrew/bin/openclaw"),
    ];
    if let Some(ref h) = home {
        candidates.push(h.join(".volta/bin/openclaw"));
        candidates.push(h.join(".npm-global/bin/openclaw"));
        candidates.push(h.join(".local/bin/openclaw"));
    }
    // 3. nvm 路径
    if let Some(h) = home {
        let nvm_base = h.join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(&nvm_base) {
            for entry in entries.flatten() {
                candidates.push(entry.path().join("bin/openclaw"));
            }
        }
    }
    candidates.into_iter().find(|p| p.is_file())
}
```

## 任务 4：commands/repair.rs

实现诊断和自动修复（参考 openclaw-quickfix 的逻辑）：

```rust
use crate::{DiagnosisItem, RepairResult};

#[tauri::command]
pub async fn run_diagnosis() -> RepairResult {
    let mut items = Vec::new();

    // 检测 1：OpenClaw 是否安装
    let openclaw_ok = which("openclaw").is_some();
    items.push(DiagnosisItem {
        check_name: "OpenClaw 安装".to_string(),
        passed: openclaw_ok,
        message: if openclaw_ok { "openclaw 命令可用".to_string() } else { "未找到 openclaw 命令".to_string() },
        auto_fixable: false,
    });

    // 检测 2：端口 18789
    let port_ok = is_port_open(18_789);
    items.push(DiagnosisItem {
        check_name: "端口 18789".to_string(),
        passed: port_ok,
        message: if port_ok { "端口 18789 正在监听".to_string() } else { "端口 18789 未监听".to_string() },
        auto_fixable: true,
    });

    // 检测 3：LaunchAgent 状态
    let la_loaded = super::super::core::service_manager::is_launchagent_loaded();
    items.push(DiagnosisItem {
        check_name: "LaunchAgent".to_string(),
        passed: la_loaded,
        message: if la_loaded { "LaunchAgent 已加载".to_string() } else { "LaunchAgent 未加载".to_string() },
        auto_fixable: true,
    });

    // 检测 4：openclaw.json 存在且 JSON 有效
    let config_ok = check_config_valid();
    items.push(DiagnosisItem {
        check_name: "配置文件".to_string(),
        passed: config_ok,
        message: if config_ok { "openclaw.json 格式正确".to_string() } else { "openclaw.json 不存在或格式错误".to_string() },
        auto_fixable: false,
    });

    // 检测 5：错误日志最近是否有 FATAL
    let log_clean = check_no_recent_fatal();
    items.push(DiagnosisItem {
        check_name: "错误日志".to_string(),
        passed: log_clean,
        message: if log_clean { "最近日志无严重错误".to_string() } else { "日志中存在 FATAL/Error，请查看修复页面".to_string() },
        auto_fixable: false,
    });

    let failed = items.iter().filter(|i| !i.passed).count();
    let summary = if failed == 0 {
        "所有检测通过，OpenClaw 运行正常".to_string()
    } else {
        format!("{failed} 项检测未通过")
    };

    RepairResult { fixed_count: 0, items, summary }
}

#[tauri::command]
pub async fn auto_fix() -> RepairResult {
    let mut fixed = 0u32;
    let mut items = Vec::new();

    // 修复 1：重启 Gateway（解决端口未监听问题）
    let restart_ok = crate::core::service_manager::restart_gateway().is_ok();
    items.push(DiagnosisItem {
        check_name: "重启 Gateway".to_string(),
        passed: restart_ok,
        message: if restart_ok { "Gateway 已重启".to_string() } else { "重启失败".to_string() },
        auto_fixable: false,
    });
    if restart_ok { fixed += 1; }

    // 修复 2：重新加载 LaunchAgent
    let la_ok = reload_launchagent();
    items.push(DiagnosisItem {
        check_name: "重载 LaunchAgent".to_string(),
        passed: la_ok,
        message: if la_ok { "LaunchAgent 已重新加载".to_string() } else { "LaunchAgent 重载失败（可能不存在 plist）".to_string() },
        auto_fixable: false,
    });
    if la_ok { fixed += 1; }

    let summary = format!("自动修复完成，修复了 {fixed} 项");
    RepairResult { fixed_count: fixed, items, summary }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

fn which(cmd: &str) -> Option<std::path::PathBuf> {
    std::process::Command::new("which")
        .arg(cmd)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| std::path::PathBuf::from(String::from_utf8_lossy(&o.stdout).trim()))
}

fn is_port_open(port: u16) -> bool {
    use std::{net::SocketAddr, time::Duration};
    std::net::TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(300),
    ).is_ok()
}

fn check_config_valid() -> bool {
    let home = match std::env::var_os("HOME") { Some(h) => h, None => return false };
    let path = std::path::PathBuf::from(home).join(".openclaw/openclaw.json");
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .is_some()
}

fn check_no_recent_fatal() -> bool {
    let home = match std::env::var_os("HOME") { Some(h) => h, None => return true };
    let log = std::path::PathBuf::from(home).join(".openclaw/logs/gateway.err.log");
    let content = match std::fs::read_to_string(&log) { Ok(v) => v, Err(_) => return true };
    let recent: Vec<&str> = content.lines().rev().take(30).collect();
    !recent.iter().any(|l| l.contains("FATAL") || l.contains("fatal"))
}

fn reload_launchagent() -> bool {
    use crate::core::service_manager::find_launchagent_plist;
    let Some(plist) = find_launchagent_plist() else { return false };
    // unload first (ignore error), then load
    let _ = std::process::Command::new("launchctl").args(["unload", plist.to_str().unwrap_or("")]).output();
    std::process::Command::new("launchctl")
        .args(["load", plist.to_str().unwrap_or("")])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
```

## 任务 5：更新 commands/mod.rs

追加：
```rust
pub mod openclaw;
pub mod repair;
```

## 任务 6：更新 lib.rs

在 `invoke_handler!` 里追加 4 个新命令：
```rust
commands::openclaw::get_detailed_status,
commands::openclaw::start_gateway,
commands::openclaw::stop_gateway,
commands::openclaw::restart_gateway,
commands::openclaw::read_logs,
commands::repair::run_diagnosis,
commands::repair::auto_fix,
```

---

## 测试验证

```bash
export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
cd /Users/openclawcn/openclaw-anzhuang/src-tauri
cargo check
```

成功标准：cargo check 零错误。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M2.md` 末尾追加：
```
---
## Agent 2 执行日志（Rust 后端）

### 测试 [填入日期时间]
命令: cargo check
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: service_manager.rs / openclaw.rs / repair.rs 全部实现，cargo check 通过
```
