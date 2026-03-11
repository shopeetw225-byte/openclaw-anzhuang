# Agent 3（Scripts）— M3 Linux 支持：安装脚本 + systemd user service 脚本

目标：为 Linux 新增一键安装脚本与 systemd user service 安装脚本，并保证日志关键字能被前端进度条识别。

## 重要约束

- 只允许修改下面「允许修改的文件」列表中的文件；不要改任何其它文件。
- 若发现必须改其它文件才能完成任务：停止并在终端说明原因与建议改法。

## 允许修改的文件

- `scripts/install-linux.sh`（新增）
- `scripts/install-service-linux.sh`（新增）

## 关键约定（必须遵守）

1) 安装页会在 Linux 上调用：`install-linux.sh`
2) systemd user service 名称固定：`openclaw-gateway.service`
3) **进度条关键字**：你的脚本输出需包含这些子串（大小写一致），以便后端 `process_runner` 推断进度：
- `Checking Node`
- `Installing Node`
- `Downloading node`
- `nvm install 22`
- `npm install -g openclaw`
- `openclaw gateway start`
- `gateway listening`
- `Done`

## 任务清单（按顺序做）

### 1) 新增 `scripts/install-linux.sh`

要求：
- `#!/usr/bin/env bash` + `set -euo pipefail`
- 不使用 `sudo`
- Node.js 检测：若未安装或主版本 < 20，则安装 Node 22（建议 nvm 用户级安装）
- 安装 OpenClaw：`npm install -g openclaw`
- 启动 Gateway：输出包含 `openclaw gateway start`
- 检测端口 18789：若能检测到监听则输出包含 `gateway listening`
  - 端口检测优先用 `ss`，其次 `lsof`，再其次 `nc`（环境可能没有某些命令，做 fallback）
- 最后输出包含 `Done`

建议结构（可参考现有 `scripts/install-macos.sh` 风格）：
- `step()` 打印 `[步骤 n/N] ...`（保留中文也行，但关键字必须出现）
- `has_cmd()` / `node_major()` / `ensure_npm_global_bin_in_path()` 等 helper

### 2) 新增 `scripts/install-service-linux.sh`

目标：生成并启用 systemd user service（无需 root）。

要求：
- `#!/usr/bin/env bash` + `set -euo pipefail`
- 仅 Linux 运行：若不是 Linux，直接报错退出
- 能找到 openclaw 可执行文件（优先 `command -v openclaw`，可补充扫描常见路径：`$HOME/.npm-global/bin`、`$HOME/.volta/bin`、`$HOME/.nvm/.../bin`、`$HOME/.local/bin`、`/usr/local/bin`、`/usr/bin`）
- 写入 service 文件到：`$HOME/.config/systemd/user/openclaw-gateway.service`
- service 内容建议：
  - `Type=oneshot` + `RemainAfterExit=yes`
  - `ExecStart=<ABS_OPENCLAW> gateway start`
  - `ExecStop=<ABS_OPENCLAW> gateway stop`
  - `ExecReload=<ABS_OPENCLAW> gateway restart`
  - `WantedBy=default.target`
- 执行：
  - `systemctl --user daemon-reload`
  - `systemctl --user enable --now openclaw-gateway.service`
  - `systemctl --user status openclaw-gateway.service --no-pager`（失败可忽略，但要输出提示）
- 如果系统没有 `systemctl` 或 `systemctl --user` 不可用：给出明确提示并退出非 0（让上层知道失败）
- 幂等：重复运行应覆盖/更新 service 文件并成功 reload

### 3) 自测

在项目根目录执行：

```bash
bash -n scripts/install-linux.sh
bash -n scripts/install-service-linux.sh
```

确保无语法错误。

## 交付要求

- 完成后在终端用 5 行以内说明你新增了哪些脚本，以及 systemd service 的文件路径与名称。
