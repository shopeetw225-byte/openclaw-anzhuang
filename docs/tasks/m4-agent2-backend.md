# M4 Agent 2 任务：Windows 执行器（PowerShell/WSL bash）+ NSSM 服务管理

## 你的角色
你负责让现有后端在 **Windows** 上具备：

1) `run_install` 能执行 `*.ps1`（PowerShell）并实时推送日志  
2) `run_install` 在 Windows 下能把 `*.sh` 通过 **WSL bash** 执行（Rust 实现）  
3) `service_manager.rs` 增加 **Windows + NSSM** 分支（Gateway 服务启停/状态）

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src-tauri/src/core/process_runner.rs`
- `src-tauri/src/commands/installer.rs`
- `src-tauri/src/core/service_manager.rs`
- `src-tauri/src/commands/openclaw.rs`
- `docs/milestones/M4.md`（只在末尾追加你的日志区块）

## 工作规则
- 执行 cargo 命令前：`export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- 必须使用 `#[cfg(target_os = "windows")]` / `#[cfg(target_os = "macos")]` / `#[cfg(target_os = "linux")]` 包裹平台代码，保证 macOS 上 `cargo check` 可通过
- 不新增依赖（保持 Cargo.toml 不变）

---

## 任务 1：process_runner 增加 PowerShell & WSL 执行器

在 `src-tauri/src/core/process_runner.rs`：

### 1-1) 增加 `run_powershell_script()`（仅 Windows）

新增函数签名（建议放在 `run_bash_script` 旁边）：

```rust
pub fn run_powershell_script(app: &AppHandle, script_path: &Path) -> Result<(), String>
```

要求：
- 命令：`powershell`（系统自带）  
  参数：`-NoProfile -ExecutionPolicy Bypass -File <script_path>`
- stdout/stderr 行流式读取，沿用现有 `install-log` 事件（同一套 `infer_progress()` 即可）
- Windows 脚本也要输出可匹配的关键字（Agent 3 会写），你只需保证读取/emit 正常

### 1-2) 增加 `run_wsl_bash_script()`（仅 Windows）

新增函数：

```rust
pub fn run_wsl_bash_script(app: &AppHandle, script_path: &Path) -> Result<(), String>
```

推荐实现方式（避免路径转换）：
- 读取 `script_path` 内容为字节
- `Command::new(“wsl”).args([“--”, “bash”, “-s”]).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())`
- **⚠️ stdin 必须在独立线程写**，主线程同步 read stdout/stderr，否则管道 buffer 满时会死锁！
  正确写法参考：
  ```rust
  let mut child = Command::new(“wsl”)
      .args([“--”, “bash”, “-s”])
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
      .map_err(|e| format!(“启动 WSL 失败: {e}”))?;

  let script_bytes = std::fs::read(script_path)
      .map_err(|e| format!(“读取脚本失败: {e}”))?;

  // 在独立线程写 stdin，避免死锁
  let mut stdin = child.stdin.take().ok_or(“无法获取 stdin”)?;
  std::thread::spawn(move || {
      use std::io::Write;
      let _ = stdin.write_all(&script_bytes);
      // stdin 在这里 drop，wsl 才能收到 EOF 开始执行
  });

  // 主线程照常读 stdout/stderr（复用现有 mpsc 逻辑）
  ```
- stdout/stderr 同样实时 emit（沿用现有 install-log 事件）

注意：
- WSL 未安装/不可用时应返回明确错误（例如”未检测到 WSL，请先安装 WSL2”）

> ✅ M4 要求“WSL 内执行 bash 脚本的 Rust 实现”，这里就是核心。

---

## 任务 2：installer.rs 让 run_install 支持子路径 + 按扩展名分发执行器

在 `src-tauri/src/commands/installer.rs`：

### 2-1) 放宽 script_name 校验（允许 `windows/install-wsl.ps1` 这种相对路径）

当前逻辑会拒绝包含 `/` 或 `\\` 的脚本名，导致无法从 `scripts/windows/` 调用。

改为：
- 允许出现 `/`（统一使用 `/` 作为分隔符）
- 仍然禁止：
  - `..` 片段
  - 绝对路径（以 `/` 开头）或包含盘符 `:`（例如 `C:`）
  - 反斜杠 `\\`（直接报错，提示调用方用 `/`）

### 2-2) 根据脚本扩展名选择执行器

规则：
- `.sh`
  - macOS/Linux：走现有 `run_bash_script`
  - Windows：走 `run_wsl_bash_script`（不是 bash）
- `.ps1`
  - Windows：走 `run_powershell_script`
  - 非 Windows：直接返回不支持错误

> 这样前端只需要统一调用 `invoke('run_install', { scriptName })`。

---

## 任务 3：service_manager.rs 增加 Windows（NSSM）分支

在 `src-tauri/src/core/service_manager.rs`：

### 3-1) 约定

- Windows 服务名：`openclaw-gateway`
- NSSM 路径优先级：
  1. `where nssm` / `where nssm.exe`
  2. `$HOME/.openclaw/bin/nssm.exe`（由 Agent 3 脚本下载/放置）

### 3-2) 接口语义

保持现有公开函数名不变，但 Windows 下行为为：
- `is_launchagent_loaded()`：返回 NSSM 服务是否存在（或是否设置为 auto start，二选一，至少“存在”即可）
- `start_gateway()` / `stop_gateway()` / `restart_gateway()`：
  - 优先调用 `nssm start/stop/restart openclaw-gateway`
  - 失败时 fallback：`openclaw gateway start/stop`
- `gateway_pid()`：Windows 下用 `netstat -ano -p tcp` 解析端口 `18789` 的 PID
- `gateway_uptime_seconds()`：Windows 下可先返回 `None`（M4 可接受），或用 PowerShell 查询进程启动时间（可选）

要求：
- 所有 Windows 代码必须 `#[cfg(target_os = "windows")]`
- macOS/Linux 分支保持原逻辑（如果 M3 已让文件变成跨平台，直接在此基础上补 Windows 分支）

---

## 任务 4：openclaw.rs 修正 Windows 下的 which

在 `src-tauri/src/commands/openclaw.rs`：

- 当前 `which()` 用的是 `which` 命令；Windows 下应改为 `where`（用 `#[cfg(target_os = "windows")]` 分支）
- 目标：Windows 下也能解析 `node` / `openclaw` 的路径（至少不报错）

---

## 测试验证（在 macOS 上）

```bash
export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
cd /Users/openclawcn/openclaw-anzhuang/src-tauri
cargo check
```

成功标准：`cargo check` 零错误（macOS 编译通过即可；Windows 分支用 cfg 隔离）。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M4.md` 末尾追加：

```
---
## Agent 2 执行日志（Windows 执行器 + NSSM service_manager）

### 测试 [填入日期时间]
命令: cargo check
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: run_install 支持 .ps1 与 WSL bash；service_manager 增加 Windows NSSM 分支；Windows 下 which→where
```

