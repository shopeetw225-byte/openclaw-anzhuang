# M5 Agent 1 任务：后端更新检测 + do_update 流式执行

## 你的角色
你负责在 Rust 后端实现 **版本检测** 和 **一键更新** 两个命令，并通过 IPC 暴露给前端。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src-tauri/src/commands/openclaw.rs`（追加 check_update、do_update 命令）
- `src-tauri/src/core/process_runner.rs`（追加 stream_command 通用流式执行器）
- `src-tauri/src/lib.rs`（追加 UpdateInfo struct、注册新命令、注册 tauri-plugin-updater）
- `src/types/ipc.ts`（追加 UpdateInfo interface）
- `docs/milestones/M5.md`（只在末尾追加你的日志区块）

## 工作规则
- 执行 cargo 命令前：`export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- **只追加，不重命名**已有字段/函数
- 不新增第三方 crate（tauri-plugin-updater 由 Agent 4 写入 Cargo.toml；你在 lib.rs 中注册即可）

---

## 任务 1：process_runner.rs 追加 stream_command

在文件末尾追加以下通用流式执行函数（在 macOS/Linux/Windows 均可用）：

```rust
/// 流式运行任意命令，将 stdout/stderr 实时 emit 为 install-log 事件
pub fn stream_command(app: &AppHandle, program: &str, args: &[&str]) -> Result<(), String> {
    emit_log(app, "Starting", 0, format!("运行: {} {}", program, args.join(" ")));

    let child = std::process::Command::new(program)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动命令失败: {e}"))?;

    run_child_with_logs(app, child, "命令执行失败")
}
```

> `run_child_with_logs` 和 `emit_log` 是文件中已有的私有函数，直接复用即可。

---

## 任务 2：lib.rs 追加 UpdateInfo struct

在现有 `RepairResult` struct 之后追加：

```rust
// ─── M5: Update ────────────────────────────────────────────────────────────
#[derive(serde::Serialize, serde::Deserialize)]
pub struct UpdateInfo {
    pub current_version: Option<String>, // 本地已安装版本，None 表示未安装
    pub latest_version: Option<String>,  // npm registry 最新版本
    pub update_available: bool,          // latest > current 则为 true
}
```

在 `invoke_handler` 末尾注册新命令（保留所有已有命令）：

```rust
// 在 tauri::generate_handler![...] 末尾追加：
commands::openclaw::check_update,
commands::openclaw::do_update,
```

同时在 `tauri::Builder::default()` 链上追加 updater 插件（在 opener 之后）：

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

> ⚠️ 如果编译时 tauri_plugin_updater 找不到（Agent 4 还没写入 Cargo.toml），用 `#[allow(unused)]` 或暂时注释该行，先让 cargo check 通过，备注说明即可。

---

## 任务 3：openclaw.rs 追加 check_update 和 do_update

在文件末尾追加（复用已有的 `which` 和 `run_cmd` 私有函数）：

```rust
// ─── M5: Update ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_update() -> Result<crate::UpdateInfo, String> {
    // 获取本地版本
    let current_version = which("openclaw").and_then(|p| {
        run_cmd(&p, &["--version"])
            .map(|v| {
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
```

---

## 任务 4：ipc.ts 追加 UpdateInfo 接口

在文件末尾追加：

```ts
// ─── M5: Update ────────────────────────────────────────────────────────────

export interface UpdateInfo {
  current_version: string | null  // 本地版本，null = 未安装
  latest_version: string | null   // npm registry 最新版本
  update_available: boolean
}

// M5 新增 Tauri 命令：
// invoke<UpdateInfo>("check_update")          -> 查询版本对比
// invoke<void>("do_update")                   -> 执行更新，流式推送 install-log 事件
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

成功标准：零错误（tauri-plugin-updater 若未安装可暂时注释 `.plugin(...)` 行，需在日志中注明）。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M5.md` 末尾追加：

```
---
## Agent 1 执行日志（后端 check_update / do_update）

### 测试 [填入日期时间]
命令: cargo check && npx tsc --noEmit
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: openclaw.rs 追加 check_update/do_update；process_runner.rs 追加 stream_command；lib.rs 追加 UpdateInfo；ipc.ts 追加 UpdateInfo 接口
```
