# M3 Agent 1 任务：IPC 扩展 + Linux 平台检测

## 你的角色
你负责在 `SystemInfo` 中添加 Linux 字段、更新 `platform.rs` 支持 Linux 发行版检测。
**其他 Agent 依赖你的类型扩展，请优先完成。**

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src-tauri/src/lib.rs`（追加 SystemInfo 字段）
- `src/types/ipc.ts`（追加对应 TS 字段）
- `src-tauri/src/core/platform.rs`（增加 Linux 分支）
- `docs/milestones/M3.md`（只在末尾追加你的日志区块）

## 工作规则
- 执行 cargo 命令前：`export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- 只追加字段，不修改已有字段，保持向后兼容
- 如需记录执行日志：只能在 `docs/milestones/M3.md` **末尾追加** `## Agent 1 执行日志...` 区块，不改动既有内容

---

## 任务 1：lib.rs 追加 SystemInfo 字段

在 `SystemInfo` struct 里**追加**两个新字段（其余字段不动）：

```rust
// 在 SystemInfo struct 末尾追加：
pub distro_id: Option<String>,    // Linux 发行版 ID，如 "ubuntu" / "debian" / "raspbian"；macOS 为 None
pub systemd_available: bool,       // Linux systemd --user 是否可用；macOS 始终 false
```

---

## 任务 2：ipc.ts 追加对应字段

在 `SystemInfo` interface 末尾追加（不修改已有字段）：

```typescript
  distro_id: string | null      // Linux: "ubuntu" | "debian" | "raspbian" | ...; macOS/Win: null
  systemd_available: boolean    // Linux systemd --user available; always false on macOS
```

---

## 任务 3：platform.rs 增加 Linux 支持

### 3-1：新增辅助函数

在文件末尾追加以下函数：

```rust
/// 读取 /etc/os-release 里的 ID 字段（如 "ubuntu"、"debian"、"raspbian"）
pub fn linux_distro_id() -> Option<String> {
    let content = std::fs::read_to_string("/etc/os-release").ok()?;
    for line in content.lines() {
        if let Some(val) = line.strip_prefix("ID=") {
            return Some(val.trim().trim_matches('"').to_lowercase());
        }
    }
    None
}

/// 读取 /etc/os-release 里的 PRETTY_NAME（如 "Ubuntu 22.04.3 LTS"）
fn linux_pretty_name() -> Option<String> {
    let content = std::fs::read_to_string("/etc/os-release").ok()?;
    for line in content.lines() {
        if let Some(val) = line.strip_prefix("PRETTY_NAME=") {
            return Some(val.trim().trim_matches('"').to_string());
        }
    }
    None
}

/// 检测 systemd --user 是否可用
fn is_systemd_available() -> bool {
    std::process::Command::new("systemctl")
        .args(["--user", "status"])
        .output()
        .map(|o| o.status.code() != Some(1))  // exit 0 or 3 (inactive) = available
        .unwrap_or(false)
}

/// Linux 下常用的 Node.js bin 目录候选
fn linux_node_candidates() -> Vec<std::path::PathBuf> {
    let mut candidates = vec![
        std::path::PathBuf::from("/usr/bin/node"),
        std::path::PathBuf::from("/usr/local/bin/node"),
        std::path::PathBuf::from("/snap/bin/node"),
    ];
    candidates.extend(nvm_bin_candidates("node"));
    candidates
}
```

### 3-2：更新 `collect_system_info()`

修改 `collect_system_info()` 函数，在返回的 `SystemInfo` 里补全新字段。

在函数里追加逻辑（在 `homebrew_available` 行之后，`crate::SystemInfo { ... }` 之前）：

```rust
    // Linux 额外字段
    #[cfg(target_os = "linux")]
    let (distro_id, systemd_available) = (linux_distro_id(), is_systemd_available());
    #[cfg(not(target_os = "linux"))]
    let (distro_id, systemd_available) = (None::<String>, false);
```

在 `crate::SystemInfo { ... }` 的字段列表末尾追加：
```rust
        distro_id,
        systemd_available,
```

### 3-3：改善 Linux 下的 `os_name`

修改 `collect_system_info()` 开头的 `os_name` 计算逻辑：

```rust
    // 替换原来的 os_name 计算：
    let os_name = {
        #[cfg(target_os = "macos")]
        {
            match run_command_simple("uname", &["-r"]) {
                Some(release) if !release.is_empty() => format!("macOS {release}"),
                _ => "macOS".to_string(),
            }
        }
        #[cfg(target_os = "linux")]
        {
            linux_pretty_name().unwrap_or_else(|| "Linux".to_string())
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            env::consts::OS.to_string()
        }
    };
```

### 3-4：Linux 下的 Node.js 路径扩展

修改 `resolve_node()` 函数，追加 Linux 候选路径：

```rust
fn resolve_node() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/usr/local/bin/node"));
        candidates.push(PathBuf::from("/opt/homebrew/bin/node"));
    }
    #[cfg(target_os = "linux")]
    {
        candidates.extend(linux_node_candidates());
    }
    candidates.extend(nvm_bin_candidates("node"));
    resolve_executable("node", &candidates)
}
```

---

## 测试验证

```bash
export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
cd /Users/openclawcn/openclaw-anzhuang/src-tauri
cargo check
cd ..
npx tsc --noEmit
```

成功标准：cargo check + tsc 零错误。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M3.md` 末尾追加：
```
---
## Agent 1 执行日志（IPC + platform Linux）

### 测试 [填入日期时间]
命令: cargo check && npx tsc --noEmit
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: SystemInfo 追加 distro_id/systemd_available，platform.rs 增加 Linux 分支
```
