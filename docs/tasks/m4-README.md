# M4 任务协调说明（Windows 支持）

> 目标：Windows 用户双击安装器，通过 GUI 完成 **WSL2 + Ubuntu + OpenClaw** 全流程安装，并可打包 **.msi + .exe(NSIS)**。

## 4 个 Agent 的分工

| Agent | 任务文件 | 负责范围 | 核心命令 |
|-------|----------|----------|----------|
| Agent 1 | `m4-agent1-platform.md` | IPC 扩展 + `platform.rs` Windows 检测（WSL/PowerShell/Admin） | `cargo check && npx tsc --noEmit` |
| Agent 2 | `m4-agent2-backend.md` | 后端执行器（PowerShell/WSL bash）+ NSSM service_manager Windows 分支 | `cargo check` |
| Agent 3 | `m4-agent3-windows-scripts.md` | Windows PowerShell 安装脚本（WSL/Node/OpenClaw/NSSM） | （可选）`pwsh -NoProfile -File` |
| Agent 4 | `m4-agent4-frontend-ci.md` | 前端 Windows 安装流程 + `tauri.conf.json` 资源/打包 + Windows CI | `npx tsc --noEmit` |

## 文件所有权（无冲突）

```
Agent 1 独占：
  src-tauri/src/lib.rs
  src/types/ipc.ts
  src-tauri/src/core/platform.rs

Agent 2 独占：
  src-tauri/src/core/process_runner.rs
  src-tauri/src/commands/installer.rs
  src-tauri/src/core/service_manager.rs
  src-tauri/src/commands/openclaw.rs

Agent 3 独占：
  scripts/windows/install-wsl.ps1
  scripts/windows/install-node-windows.ps1
  scripts/windows/install-openclaw.ps1
  scripts/windows/install-nssm.ps1
  scripts/windows/register-service-nssm.ps1

Agent 4 独占：
  src/pages/Welcome.tsx
  src/pages/Installing.tsx
  src-tauri/tauri.conf.json
  .github/workflows/m4-windows.yml
```

> 里程碑日志：每个 Agent 只允许在 `docs/milestones/M4.md` 末尾追加自己的 `## Agent X 执行日志...` 区块，不改已有内容。

## 执行顺序

- Agent 1、2、3 可并行启动
- Agent 4 依赖 Agent 1（TS 类型字段）与 Agent 2（run_install 支持 .ps1 / WSL）至少其一完成后再跑 `tsc`

## 启动指令（发给每个 Agent）

**Agent 1：**
```
请阅读并严格执行 /Users/openclawcn/openclaw-anzhuang/docs/tasks/m4-agent1-platform.md 中的所有任务。不要修改该文件中未列出的任何文件。执行 cargo 命令前设置 PATH：export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
```

**Agent 2：**
```
请阅读并严格执行 /Users/openclawcn/openclaw-anzhuang/docs/tasks/m4-agent2-backend.md 中的所有任务。不要修改该文件中未列出的任何文件。执行 cargo 命令前设置 PATH：export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
```

**Agent 3：**
```
请阅读并严格执行 /Users/openclawcn/openclaw-anzhuang/docs/tasks/m4-agent3-windows-scripts.md 中的所有任务。不要修改该文件中未列出的任何文件。
```

**Agent 4：**
```
请阅读并严格执行 /Users/openclawcn/openclaw-anzhuang/docs/tasks/m4-agent4-frontend-ci.md 中的所有任务。不要修改该文件中未列出的任何文件。注意：tsc 验证需等 Agent 1 完成类型字段后再运行。
```

