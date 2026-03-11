# M4 Agent 1 任务：IPC 扩展 + Windows 平台检测（WSL/PowerShell/Admin）

## 你的角色
你负责为 M4 增加 **Windows 安装前置检测能力**：WSL2 状态、PowerShell 版本、是否管理员权限，并把结果通过 `SystemInfo` 暴露给前端。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src-tauri/src/lib.rs`（追加 SystemInfo 字段）
- `src/types/ipc.ts`（追加对应 TS 字段）
- `src-tauri/src/core/platform.rs`（增加 Windows 检测逻辑，必须 `#[cfg(target_os = "windows")]`）
- `docs/milestones/M4.md`（只在末尾追加你的日志区块）

## 工作规则
- 执行 cargo 命令前：`export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- **只追加字段**，不修改/重命名已有字段，保持向后兼容
- Windows 相关命令必须放在 `#[cfg(target_os = "windows")]`，确保 macOS 上 `cargo check` 可通过

---

## 任务 1：扩展 SystemInfo（Rust）

在 `src-tauri/src/lib.rs` 的 `SystemInfo` struct 末尾**追加**以下字段：

```rust
    // ─── M4: Windows support ───────────────────────────────────────────────
    pub powershell_version: Option<String>, // Windows: PowerShell 版本（如 "5.1.22621.2506"）；非 Windows 为 None
    pub wsl_state: Option<String>,          // Windows: "available" | "needs_install" | "unsupported" | "unknown"；非 Windows 为 None
    pub wsl_default_distro: Option<String>, // Windows: 默认 distro 名（如 "Ubuntu-22.04"）；非 Windows 为 None
    pub wsl_has_ubuntu: bool,               // Windows: 是否检测到 Ubuntu distro；非 Windows 为 false
    pub windows_admin: bool,                // Windows: 是否管理员权限；非 Windows 为 false
```

> 说明：先用 `String`/`Option<String>`，不要引入 enum（避免跨端序列化复杂度）。

---

## 任务 2：扩展 SystemInfo（TypeScript）

在 `src/types/ipc.ts` 的 `SystemInfo` interface 末尾**追加**：

```ts
  // ─── M4: Windows support ───────────────────────────────────────────────
  powershell_version: string | null
  wsl_state: string | null           // "available" | "needs_install" | "unsupported" | "unknown"
  wsl_default_distro: string | null
  wsl_has_ubuntu: boolean
  windows_admin: boolean
```

---

## 任务 3：platform.rs 增加 Windows 检测并填充字段

在 `src-tauri/src/core/platform.rs`：

### 3-1) 在 `collect_system_info()` 中填充默认值（非 Windows）

在构造 `crate::SystemInfo { ... }` 之前追加：

```rust
    #[cfg(target_os = "windows")]
    let (powershell_version, wsl_state, wsl_default_distro, wsl_has_ubuntu, windows_admin) =
        windows_collect_install_prereq();

    #[cfg(not(target_os = "windows"))]
    let (powershell_version, wsl_state, wsl_default_distro, wsl_has_ubuntu, windows_admin) =
        (None::<String>, None::<String>, None::<String>, false, false);
```

并在 `crate::SystemInfo { ... }` 字段末尾追加：

```rust
        powershell_version,
        wsl_state,
        wsl_default_distro,
        wsl_has_ubuntu,
        windows_admin,
```

### 3-2) 追加 Windows helper（文件末尾追加即可）

在文件末尾新增（仅 Windows 编译）：

```rust
#[cfg(target_os = "windows")]
fn windows_collect_install_prereq() -> (Option<String>, Option<String>, Option<String>, bool, bool) {
    let powershell_version = windows_powershell_version();
    let (wsl_state, wsl_default_distro, wsl_has_ubuntu) = windows_wsl_status();
    let windows_admin = windows_is_admin();
    (powershell_version, Some(wsl_state), wsl_default_distro, wsl_has_ubuntu, windows_admin)
}

#[cfg(target_os = "windows")]
fn windows_powershell_version() -> Option<String> {
    // 优先 powershell.exe（系统自带），不依赖 pwsh
    run_command_simple("powershell", &["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"])
}

#[cfg(target_os = "windows")]
fn windows_is_admin() -> bool {
    // 非管理员通常返回 “Access is denied.”
    std::process::Command::new("cmd")
        .args(["/C", "net", "session"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn windows_wsl_status() -> (String, Option<String>, bool) {
    // 返回：(state, default_distro, has_ubuntu)
    // state: available | needs_install | unsupported | unknown
    let out = std::process::Command::new("wsl")
        .args(["-l", "-v"])
        .output();

    let Ok(out) = out else {
        return ("unsupported".to_string(), None, false);
    };

    // ⚠️ 重要：Windows 上 wsl -l -v 输出是 UTF-16 LE 编码（带 BOM），
    // 不能直接用 from_utf8_lossy，否则会乱码导致 wsl_state 一直返回 "unknown"。
    // 需要手动将 UTF-16 LE 字节转为 UTF-8 字符串：
    fn utf16le_to_string(bytes: &[u8]) -> String {
        // 跳过 BOM（0xFF 0xFE）
        let start = if bytes.starts_with(&[0xFF, 0xFE]) { 2 } else { 0 };
        let words: Vec<u16> = bytes[start..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&words)
    }
    let stdout = utf16le_to_string(&out.stdout);
    let stderr = utf16le_to_string(&out.stderr);
    let all = format!("{stdout}\n{stderr}").to_lowercase();

    if out.status.success() {
        // 解析默认 distro（带 * 的那行）
        let mut default_distro: Option<String> = None;
        let mut has_ubuntu = false;
        for line in stdout.lines() {
            let raw = line.trim();
            if raw.is_empty() { continue; }
            if raw.to_lowercase().contains("ubuntu") {
                has_ubuntu = true;
            }
            // 典型：* Ubuntu-22.04    Running    2
            if raw.starts_with('*') {
                let name = raw.trim_start_matches('*').trim();
                let name = name.split_whitespace().next().unwrap_or("").to_string();
                if !name.is_empty() {
                    default_distro = Some(name);
                }
            }
        }

        return ("available".to_string(), default_distro, has_ubuntu);
    }

    // 常见错误关键词：WSL feature 未启用/未安装
    if all.contains("subsystem for linux") || all.contains("wsl") && all.contains("not") && all.contains("enabled") {
        return ("needs_install".to_string(), None, false);
    }

    ("unknown".to_string(), None, false)
}
```

> 注意：上面解析逻辑允许先做 MVP；如果你想更稳健，可以补充对 `wsl --status` 的解析，但不要引入新依赖。

---

## 测试验证（在 macOS 上）

```bash
export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
cd /Users/openclawcn/openclaw-anzhuang/src-tauri
cargo check
cd ..
npx tsc --noEmit
```

成功标准：`cargo check` + `tsc` 零错误。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M4.md` 末尾追加：

```
---
## Agent 1 执行日志（IPC + platform Windows 检测）

### 测试 [填入日期时间]
命令: cargo check && npx tsc --noEmit
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: SystemInfo 追加 powershell_version/wsl_state/...；platform.rs 增加 Windows WSL/PS/Admin 检测
```

