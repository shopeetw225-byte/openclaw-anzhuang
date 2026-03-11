# M3 Agent 2 任务：service_manager.rs Linux 分支

## 你的角色
你负责在现有 macOS `service_manager.rs` 里添加 Linux systemd 分支，使同一套代码在 macOS 和 Linux 都能编译运行。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src-tauri/src/core/service_manager.rs`（追加 Linux 分支，不删除 macOS 代码）
- `docs/milestones/M3.md`（只在末尾追加你的日志区块）

## 工作规则
- 执行 cargo 命令前：`export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- macOS 代码用 `#[cfg(target_os = "macos")]` 包裹，Linux 代码用 `#[cfg(target_os = "linux")]`
- 不删除任何现有函数，只在其中增加 `#[cfg]` 分支
- 如需记录执行日志：只能在 `docs/milestones/M3.md` **末尾追加** `## Agent 2 执行日志...` 区块，不改动既有内容

---

## 当前 service_manager.rs 结构

文件里有以下 pub 函数（全部 macOS 逻辑）：
- `is_launchagent_loaded() -> bool`
- `find_launchagent_plist() -> Option<PathBuf>`
- `start_gateway() -> Result<(), String>`
- `stop_gateway() -> Result<(), String>`
- `restart_gateway() -> Result<(), String>`
- `gateway_pid() -> Option<u32>`
- `gateway_uptime_seconds(pid: u32) -> Option<u64>`

---

## 任务：重构为跨平台实现

### 方案：在每个函数内部用 `cfg` 分支

对每个公开函数，将现有 macOS 实现用 `#[cfg(target_os = "macos")]` 包裹，然后追加 Linux 实现。

**具体修改方式**：将文件内容替换为以下结构（保留原有 macOS 逻辑，增加 Linux 逻辑）：

```rust
use std::{
    env,
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::Duration,
};

const GATEWAY_PORT: u16 = 18_789;

// ─── is_launchagent_loaded ─────────────────────────────────────────────────────

pub fn is_launchagent_loaded() -> bool {
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
        // 检测 systemd user service 是否 active
        Command::new("systemctl")
            .args(["--user", "is-active", "openclaw-gateway"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        false
    }
}

// ─── find_launchagent_plist ────────────────────────────────────────────────────

/// macOS: returns path to LaunchAgent plist
/// Linux: returns path to systemd user service file
pub fn find_launchagent_plist() -> Option<PathBuf> {
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
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        None
    }
}

// ─── start_gateway ─────────────────────────────────────────────────────────────

pub fn start_gateway() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(plist) = find_launchagent_plist() {
            let ok = run_command_success("launchctl", &["load", &path_to_arg(&plist)]);
            if ok {
                return Ok(());
            }
        }
        if run_command_success("openclaw", &["gateway", "start"]) {
            return Ok(());
        }
        Err("启动 Gateway 失败".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        // 先尝试 systemd，再直接启动
        if run_command_success("systemctl", &["--user", "start", "openclaw-gateway"]) {
            return Ok(());
        }
        if run_command_success("openclaw", &["gateway", "start"]) {
            return Ok(());
        }
        Err("启动 Gateway 失败".to_string())
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        Err("不支持的平台".to_string())
    }
}

// ─── stop_gateway ──────────────────────────────────────────────────────────────

pub fn stop_gateway() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut any_ok = false;
        if let Some(plist) = find_launchagent_plist() {
            any_ok |= run_command_success("launchctl", &["unload", &path_to_arg(&plist)]);
        }
        any_ok |= run_command_success("openclaw", &["gateway", "stop"]);
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
        any_ok |= run_command_success("openclaw", &["gateway", "stop"]);
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
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        Err("不支持的平台".to_string())
    }
}

// ─── restart_gateway ───────────────────────────────────────────────────────────

pub fn restart_gateway() -> Result<(), String> {
    let _ = stop_gateway();
    thread::sleep(Duration::from_secs(1));
    start_gateway()
}

// ─── gateway_pid ───────────────────────────────────────────────────────────────

pub fn gateway_pid() -> Option<u32> {
    let out = Command::new("lsof")
        .args(["-ti", &format!(":{GATEWAY_PORT}")])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    stdout.lines().next()?.trim().parse::<u32>().ok()
}

// ─── gateway_uptime_seconds ────────────────────────────────────────────────────

pub fn gateway_uptime_seconds(pid: u32) -> Option<u64> {
    let out = Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "etime="])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    parse_etime_to_seconds(String::from_utf8_lossy(&out.stdout).trim())
}

// ─── private helpers ───────────────────────────────────────────────────────────

fn run_command_success(cmd: &str, args: &[&str]) -> bool {
    Command::new(cmd)
        .args(args)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn path_to_arg(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn parse_etime_to_seconds(s: &str) -> Option<u64> {
    // Formats: mm:ss | hh:mm:ss | dd-hh:mm:ss
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
        2 => (0, parts[0].parse::<u64>().ok()?, parts[1].parse::<u64>().ok()?),
        1 => (0, 0, parts[0].parse::<u64>().ok()?),
        _ => return None,
    };
    Some(days * 86_400 + hours * 3_600 + mins * 60 + secs)
}
```

> **提示**：上面是完整文件内容，直接替换原文件即可。macOS 逻辑与原来完全一致，只是加了 `#[cfg]` 包裹。

---

## 测试验证

```bash
export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
cd /Users/openclawcn/openclaw-anzhuang/src-tauri
cargo check
```

成功标准：cargo check 零错误（在 macOS 上编译，macOS 分支生效）。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M3.md` 末尾追加：
```
---
## Agent 2 执行日志（service_manager Linux 分支）

### 测试 [填入日期时间]
命令: cargo check
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: service_manager.rs 增加 Linux systemd 分支，macOS 分支不变，cargo check 通过
```
