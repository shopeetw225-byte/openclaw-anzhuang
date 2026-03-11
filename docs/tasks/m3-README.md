# M3 任务协调说明

## 4 个 Agent 的分工

| Agent | 任务文件 | 负责范围 | 核心命令 |
|-------|----------|----------|----------|
| Agent 1 | `m3-agent1-platform.md` | SystemInfo 扩展 + platform.rs Linux 检测 | `cargo check && npx tsc --noEmit` |
| Agent 2 | `m3-agent2-service-manager.md` | service_manager.rs 跨平台 `#[cfg]` 分支 | `cargo check` |
| Agent 3 | `m3-agent3-scripts.md` | install-linux.sh + install-service-linux.sh | `bash -n` 语法检查 |
| Agent 4 | `m3-agent4-frontend-bundle.md` | Welcome/Installing Linux 适配 + tauri.conf.json bundle | `npx tsc --noEmit` |

## 文件所有权（无冲突）

```
Agent 1 独占：
  src-tauri/src/lib.rs（追加 SystemInfo 字段）
  src/types/ipc.ts（追加 TS 字段）
  src-tauri/src/core/platform.rs（Linux 分支）

Agent 2 独占：
  src-tauri/src/core/service_manager.rs（替换为跨平台版本）

Agent 3 独占：
  scripts/install-linux.sh（新建）
  scripts/install-service-linux.sh（新建）

Agent 4 独占：
  src/pages/Welcome.tsx（Linux UI 适配）
  src/pages/Installing.tsx（Linux 脚本选择）
  src-tauri/tauri.conf.json（追加 Linux bundle）
```

## 执行顺序

- Agent 1、2、3 可**并行**启动
- Agent 4 依赖 Agent 1 完成（需要 ipc.ts 里的新字段）；写代码可以并行，但 `tsc` 验证要等 Agent 1 跑完

## 启动指令

**Agent 1：**
```
请阅读并严格执行 /Users/openclawcn/openclaw-anzhuang/docs/tasks/m3-agent1-platform.md 中的所有任务。不要修改该文件中未列出的任何文件。执行 cargo 命令前设置 PATH：export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
```

**Agent 2：**
```
请阅读并严格执行 /Users/openclawcn/openclaw-anzhuang/docs/tasks/m3-agent2-service-manager.md 中的所有任务。不要修改该文件中未列出的任何文件。执行 cargo 命令前设置 PATH：export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
```

**Agent 3：**
```
请阅读并严格执行 /Users/openclawcn/openclaw-anzhuang/docs/tasks/m3-agent3-scripts.md 中的所有任务。不要修改该文件中未列出的任何文件。
```

**Agent 4：**
```
请阅读并严格执行 /Users/openclawcn/openclaw-anzhuang/docs/tasks/m3-agent4-frontend-bundle.md 中的所有任务。不要修改该文件中未列出的任何文件。注意：tsc 验证需等 Agent 1 完成后再运行。
```
