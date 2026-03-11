# Agent 2（Backend/Rust）— M3 Linux 支持：发行版识别 + systemd user service

目标：实现 Linux 发行版识别（Ubuntu/Debian/Raspbian），并在后端把 Gateway 服务管理扩展到 systemd user service。

## 重要约束

- 只允许修改下面「允许修改的文件」列表中的文件；不要改任何其它文件。
- 若发现必须改其它文件才能完成任务：停止并在终端说明原因与建议改法。

## 允许修改的文件

- `src-tauri/src/lib.rs`
- `src-tauri/src/core/platform.rs`
- `src-tauri/src/core/service_manager.rs`
- `src-tauri/src/commands/repair.rs`

## 任务清单（按顺序做）

### 1) 扩展 SystemInfo 契约（platform + linux_distro）

在 `src-tauri/src/lib.rs` 的 `SystemInfo` struct 新增字段：

- `pub platform: String`（值为 `macos` / `linux` / `windows`，来自 `std::env::consts::OS`）
- `pub linux_distro: Option<String>`（仅 Linux 下填充；`ubuntu` / `debian` / `raspbian` / `unknown`；非 Linux 返回 `None`）

### 2) platform.rs：读取 `/etc/os-release` 识别发行版

在 `src-tauri/src/core/platform.rs`：

- `collect_system_info()` 填充上面的 `platform` / `linux_distro`
- 当 `platform == "linux"`：
  - 读取 `/etc/os-release`（不存在则 `linux_distro = Some("unknown")`）
  - 解析 `ID=`、`NAME=`、`PRETTY_NAME=`、`ID_LIKE=`（尽量健壮：支持双引号包裹、忽略空行/注释）
  - 推断发行版：
    - `ID == "ubuntu"` → `ubuntu`
    - `ID == "debian"` → `debian`
    - `ID == "raspbian"` 或 `PRETTY_NAME/NAME` 含 `Raspberry`/`Raspbian` → `raspbian`
    - 其它 → `unknown`
  - `os_name` 建议改为更友好（但最小改动）：优先使用 `PRETTY_NAME`，并附带内核版本（`uname -r`）

注意：不要引入新依赖；用 `std::fs` + 字符串解析即可。

### 3) service_manager.rs：增加 Linux systemd 分支（复用 launchagent_loaded 字段语义）

约定：
- systemd user service 名称固定为：`openclaw-gateway.service`
- 在 Linux 下，将「LaunchAgent 已加载」语义复用为「systemd user service 已启用」

在 `src-tauri/src/core/service_manager.rs`：

- `is_launchagent_loaded()`：
  - macOS：保持原逻辑
  - Linux：尝试执行 `systemctl --user is-enabled openclaw-gateway.service`，成功则 true，否则 false
- `start_gateway()` / `stop_gateway()` / `restart_gateway()`：
  - Linux：优先 `systemctl --user start/stop/restart openclaw-gateway.service`（若失败再 fallback 到 `openclaw gateway start/stop`）
  - macOS：保持原逻辑
- `gateway_pid()`：
  - Linux：优先 `systemctl --user show -p MainPID --value openclaw-gateway.service`（>0 才算 PID）
  - fallback：保留现有 `lsof -ti :18789` 方案（若系统有 lsof）

### 4) repair.rs：把 LaunchAgent 检测/修复改成通用（最小改动）

在 `src-tauri/src/commands/repair.rs`：

- 第 3 项检测的 `check_name` 从固定 `LaunchAgent` 改为 `自启服务`
- 文案里避免写死 LaunchAgent（例如改成「自启服务已启用/未启用」）
- `reload_launchagent()`：
  - Linux：尝试 `systemctl --user daemon-reload` + `systemctl --user restart openclaw-gateway.service`（或 `enable --now`，二选一即可；建议 restart）
  - macOS：保留现有 launchctl 逻辑

要求：在非 Linux/macOS 下不要 panic，失败返回 false 即可。

### 5) 自测

在 `src-tauri` 目录执行：

```bash
cargo check
```

确保通过。

## 交付要求

- 完成后在终端用 5 行以内说明：
  - 新增的 SystemInfo 字段名（`platform` / `linux_distro`）
  - systemd service 名称（`openclaw-gateway.service`）
  - 你验证过的命令（`cargo check`）
