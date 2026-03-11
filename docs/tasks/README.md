# M1 多 Agent 协作计划

## 并行策略

```
立即开始（无依赖）：
  Agent 1 ──── 基础配置 + IPC 契约 ────────┐
  Agent 3 ──── Shell 脚本（完全独立）       │
                                            ↓
Agent 1 完成后（解锁）：              阶段 6 集成测试
  Agent 2 ──── Rust 后端 ─────────────────┘
  Agent 4 ──── 前端页面（可先用 stub）────┘
```

## 启动顺序

| 优先级 | Agent | 任务文件 | 依赖 |
|--------|-------|---------|------|
| 1（立即）| Agent 1 | agent1-config.md | 无 |
| 1（立即）| Agent 3 | agent3-scripts.md | 无 |
| 2（Agent 1 完成后）| Agent 2 | agent2-backend.md | Agent 1 完成 Cargo.toml |
| 2（可提前开始写代码）| Agent 4 | agent4-frontend.md | Agent 1 完成后可跑 dev |

## 文件所有权（绝对不能越界）

| 目录/文件 | 负责 Agent |
|-----------|-----------|
| `src-tauri/tauri.conf.json` | Agent 1 |
| `src-tauri/Cargo.toml` | Agent 1 |
| `tailwind.config.js`, `postcss.config.js` | Agent 1 |
| `src/index.css` | Agent 1 |
| `src/types/ipc.ts` | Agent 1 |
| `vite.config.ts` | Agent 1 |
| `src-tauri/src/core/` | Agent 2 |
| `src-tauri/src/commands/` | Agent 2 |
| `src-tauri/src/lib.rs` | Agent 2 |
| `scripts/` | Agent 3 |
| `src/App.tsx` | Agent 4 |
| `src/pages/` | Agent 4 |
| `src/components/` | Agent 4 |
| `src/hooks/` | Agent 4 |
| `src/stores/` | Agent 4 |

## IPC 契约（所有 Agent 必须遵守）

Rust 命令名 ↔ 前端 invoke 名必须完全一致：

| Rust 函数 | 前端 invoke | 参数 | 返回值 |
|-----------|------------|------|--------|
| `get_system_info` | `"get_system_info"` | 无 | `SystemInfo` |
| `get_openclaw_status` | `"get_openclaw_status"` | 无 | `OpenClawStatus` |
| `run_install` | `"run_install"` | `{ scriptName: string }` | `void` |
| `save_config` | `"save_config"` | `{ config: SaveConfigPayload }` | `void` |

Tauri 事件：`"install-log"` → `InstallLogPayload`

## 里程碑文档规则

每个 Agent 只追加自己的区段到 `docs/milestones/M1.md`，不修改其他内容：
- Agent 1 → 追加 `## Agent 1 执行日志`
- Agent 2 → 追加 `## Agent 2 执行日志`
- Agent 3 → 追加 `## Agent 3 执行日志`
- Agent 4 → 追加 `## Agent 4 执行日志`
