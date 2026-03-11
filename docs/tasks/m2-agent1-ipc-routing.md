# M2 Agent 1 任务：IPC 扩展 + 智能路由

## 你的角色
你负责扩展 IPC 契约类型、更新路由逻辑、扩展状态管理。**其他 Agent 依赖你的类型定义**，请尽快完成。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src/types/ipc.ts`（追加 M2 类型）
- `src/App.tsx`（更新路由逻辑）
- `src/stores/installStore.ts`（扩展状态）
- `src/hooks/useOpenClawStatus.ts`（改为 5s 轮询）

---

## 任务 1：扩展 src/types/ipc.ts

在文件末尾**追加**以下内容（不要修改已有内容）：

```typescript
// ─── M2: Dashboard & Repair types ────────────────────────────────────────────

export interface GatewayDetailedStatus {
  installed: boolean
  version: string | null
  gateway_running: boolean
  gateway_port: number
  gateway_pid: number | null        // process ID, null if not running
  uptime_seconds: number | null     // null if not running
  launchagent_loaded: boolean       // macOS: is LaunchAgent plist loaded
}

export interface LogEntry {
  line: string
}

export interface DiagnosisItem {
  check_name: string      // e.g. "Plugin Paths", "Port 18789", "LaunchAgent"
  passed: boolean
  message: string         // human-readable finding
  auto_fixable: boolean
}

export interface RepairResult {
  fixed_count: number
  items: DiagnosisItem[]
  summary: string
}

// M2 Tauri commands:
// invoke<GatewayDetailedStatus>("get_detailed_status")
// invoke<void>("start_gateway")
// invoke<void>("stop_gateway")
// invoke<void>("restart_gateway")
// invoke<LogEntry[]>("read_logs", { lines: number })
// invoke<RepairResult>("run_diagnosis")
// invoke<RepairResult>("auto_fix")
```

## 任务 2：更新 src/hooks/useOpenClawStatus.ts

M2 要求 5 秒轮询（M1 是 30 秒）。修改默认值：

```typescript
// 将这一行：
export function useOpenClawStatus(refreshIntervalMs = 30_000) {
// 改为：
export function useOpenClawStatus(refreshIntervalMs = 5_000) {
```

同时把文件顶部的临时类型 stub（重复定义的 `OpenClawStatus`）删除，改为从 ipc.ts 导入：

```typescript
// 删除文件顶部的 interface OpenClawStatus { ... } 定义
// 改为：
import type { OpenClawStatus } from '../types/ipc'
```

## 任务 3：扩展 src/stores/installStore.ts

在 store 里追加 Dashboard 相关状态（在现有 `InstallStore` 接口和 `create` 里追加，不替换原有内容）：

```typescript
// 在 InstallStore interface 里追加：
  gatewayDetailedStatus: GatewayDetailedStatus | null
  setGatewayDetailedStatus: (s: GatewayDetailedStatus | null) => void

// 在 create() 里追加：
  gatewayDetailedStatus: null,
  setGatewayDetailedStatus: (s) => set({ gatewayDetailedStatus: s }),
```

在文件顶部追加 import：
```typescript
import type { GatewayDetailedStatus } from '../types/ipc'
```

> ⚠️ **重要**：installStore.ts 顶部有 `export interface SystemInfo` 和 `export interface InstallLogPayload` 的 stub 定义。
> **不要删除它们**！`Welcome.tsx`、`LogPanel.tsx`、`useInstallLog.ts` 都从这里导入这些类型。
> 删掉会导致 tsc 报错。只做追加，不做删除。

## 任务 4：更新 src/App.tsx

M2 要求：**检测到已安装时直接显示 Dashboard**。

在 App.tsx 里添加一个根路由守卫逻辑——启动时调用 `get_openclaw_status`，如果已安装则默认跳转 `/dashboard`：

```typescript
// 在 App() 内，BrowserRouter 之前添加：
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { OpenClawStatus } from './types/ipc'

// App 组件内：
const [initialRoute, setInitialRoute] = useState<string | null>(null)

useEffect(() => {
  const isTauri = Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__)
  if (!isTauri) { setInitialRoute('/welcome'); return }

  invoke<OpenClawStatus>('get_openclaw_status')
    .then(s => setInitialRoute(s.installed ? '/dashboard' : '/welcome'))
    .catch(() => setInitialRoute('/welcome'))
}, [])

if (!initialRoute) {
  // 启动检测中，显示简单 loading
  return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg,#f3efe7)', color:'var(--text-secondary,#6b4c3b)' }}>正在检测...</div>
}
```

然后完整更新路由表（补上 `/dashboard` 和 `/repair` 这两个 M2 页面）：

```typescript
import Dashboard from './pages/Dashboard'
import Repair from './pages/Repair'

// Routes 里：
<Route path="/" element={<Navigate to={initialRoute} replace />} />
<Route path="/welcome" element={<Welcome />} />
<Route path="/installing" element={<Installing />} />
<Route path="/config-wizard" element={<ConfigWizard />} />
<Route path="/dashboard" element={<Dashboard />} />
<Route path="/repair" element={<Repair />} />
```

> ⚠️ **重要**：`/repair` 路由必须加上，否则 Agent 4 创建的 Repair 页面无法访问。

---

## 测试验证

```bash
npx tsc --noEmit
```
成功标准：零 TypeScript 错误。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M2.md` 末尾追加：
```
---
## Agent 1 执行日志（IPC 扩展 + 路由）

### 测试 [填入日期时间]
命令: npx tsc --noEmit
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: 扩展 ipc.ts M2 类型、更新路由守卫、5s 轮询、store 扩展
```
