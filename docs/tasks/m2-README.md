# M2 任务协调说明

## 4 个 Agent 的分工

| Agent | 任务文件 | 负责范围 | 核心命令 |
|-------|----------|----------|----------|
| Agent 1 | `m2-agent1-ipc-routing.md` | IPC 契约扩展 + 路由优化 | `npx tsc --noEmit` |
| Agent 2 | `m2-agent2-backend.md` | Rust 后端（服务控制 + 诊断） | `cargo check` |
| Agent 3 | `m2-agent3-scripts.md` | 诊断修复 Shell 脚本 | `bash scripts/diagnose.sh` |
| Agent 4 | `m2-agent4-frontend.md` | Dashboard + Repair 前端页面 | `npx tsc --noEmit` |

## 文件所有权（无冲突保证）

```
Agent 1 独占：
  src/types/ipc.ts
  src/App.tsx
  src/hooks/useOpenClawStatus.ts
  src/stores/installStore.ts

Agent 2 独占：
  src-tauri/src/core/service_manager.rs（新建）
  src-tauri/src/core/mod.rs（追加）
  src-tauri/src/commands/openclaw.rs（新建）
  src-tauri/src/commands/repair.rs（新建）
  src-tauri/src/commands/mod.rs（追加）
  src-tauri/src/lib.rs（追加）

Agent 3 独占：
  scripts/diagnose.sh（新建）
  scripts/fix-gateway.sh（新建）

Agent 4 独占：
  src/pages/Dashboard.tsx（替换占位符）
  src/pages/Repair.tsx（新建）
  src/components/StatusBadge.tsx（新建）
```

## 启动指令（发给每个 Agent）

**Agent 1：**
```
请阅读并严格执行 /Users/openclawcn/openclaw-anzhuang/docs/tasks/m2-agent1-ipc-routing.md 中的所有任务。不要修改该文件中未列出的任何文件。
```

**Agent 2：**
```
请阅读并严格执行 /Users/openclawcn/openclaw-anzhuang/docs/tasks/m2-agent2-backend.md 中的所有任务。不要修改该文件中未列出的任何文件。
执行 cargo 命令前设置：export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
```

**Agent 3：**
```
请阅读并严格执行 /Users/openclawcn/openclaw-anzhuang/docs/tasks/m2-agent3-scripts.md 中的所有任务。不要修改该文件中未列出的任何文件。
```

**Agent 4：**
```
请阅读并严格执行 /Users/openclawcn/openclaw-anzhuang/docs/tasks/m2-agent4-frontend.md 中的所有任务。不要修改该文件中未列出的任何文件。
```

## 里程碑文档

完成后各 Agent 各自追加记录到 `docs/milestones/M2.md`（不会冲突，各自追加到末尾）。
