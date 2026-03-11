# Agent 4 任务：React 前端页面

## 你的角色
你负责所有前端 React 页面和组件。你可以立即开始写代码，即使 Agent 1 还没完成配置，只需要先写 type stubs。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src/App.tsx`
- `src/pages/Welcome.tsx`（新建）
- `src/pages/Installing.tsx`（新建）
- `src/pages/ConfigWizard.tsx`（新建）
- `src/components/LogPanel.tsx`（新建）
- `src/components/StepProgress.tsx`（新建）
- `src/hooks/useInstallLog.ts`（新建）
- `src/hooks/useOpenClawStatus.ts`（新建）
- `src/stores/installStore.ts`（新建）

**不要修改**：src-tauri/ 目录、index.html、vite.config.ts、index.css、package.json

## 工作规则
- 组件变量名和注释用英文
- 所有用户可见文字用中文
- 使用 Tailwind CSS 和 CSS 变量（--accent, --bg, --bg-card, --text-primary 等）
- Tauri IPC 调用使用 `@tauri-apps/api/core` 的 `invoke` 和 `listen`

---

## IPC 契约（必须严格遵守，与 src/types/ipc.ts 一致）

```typescript
// 如果 Agent 1 还没创建 src/types/ipc.ts，先在此文件顶部临时定义这些类型
// Agent 1 完成后，改为 import from '../types/ipc'

export interface SystemInfo {
  os_name: string;
  arch: string;
  node_version: string | null;
  npm_version: string | null;
  openclaw_version: string | null;
  openclaw_installed: boolean;
  gateway_running: boolean;
  gateway_port: number;
  homebrew_available: boolean;
  disk_free_mb: number;
}

export interface OpenClawStatus {
  installed: boolean;
  version: string | null;
  gateway_running: boolean;
}

export interface InstallLogPayload {
  step: string;
  percentage: number;
  message: string;
  timestamp: number;
}

export interface SaveConfigPayload {
  model_primary: string;
  api_keys: Record<string, string>;
  telegram_enabled: boolean;
  telegram_bot_token: string;
  telegram_allow_from: number[];
}

// Tauri commands:
// invoke<SystemInfo>("get_system_info")
// invoke<void>("run_install", { scriptName: "install-macos.sh" })
// invoke<void>("save_config", { config: SaveConfigPayload })
// invoke<OpenClawStatus>("get_openclaw_status")
// listen<InstallLogPayload>("install-log", handler)
```

---

## 设计规范

**颜色变量**（来自 index.css）：
```
--accent: #c94b1d        橙棕色主色调（按钮、强调）
--accent-hover: #a83c17  hover 状态
--bg: #f3efe7            页面背景
--bg-card: #faf7f2       卡片背景
--text-primary: #2c1810  主文字
--text-secondary: #6b4c3b 次要文字
--border: #d4c5b5        边框
--success: #2d7a4f       成功绿
--warning: #b45309       警告黄
--error: #dc2626         错误红
```

**通用类名模式**：
```
背景：bg-[var(--bg)]、bg-[var(--bg-card)]
主按钮：bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-6 py-2 rounded-lg
次要按钮：border border-[var(--border)] text-[var(--text-secondary)] px-6 py-2 rounded-lg
卡片：bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4
```

---

## 任务 1：src/stores/installStore.ts（Zustand 状态）

```typescript
import { create } from 'zustand'
import type { SystemInfo, InstallLogPayload } from '../types/ipc'

interface InstallStore {
  systemInfo: SystemInfo | null
  setSystemInfo: (info: SystemInfo) => void
  logs: InstallLogPayload[]
  appendLog: (log: InstallLogPayload) => void
  clearLogs: () => void
  installProgress: number
  setProgress: (p: number) => void
  currentStep: string
  setCurrentStep: (s: string) => void
}

export const useInstallStore = create<InstallStore>((set) => ({
  systemInfo: null,
  setSystemInfo: (info) => set({ systemInfo: info }),
  logs: [],
  appendLog: (log) => set((s) => ({ logs: [...s.logs, log], installProgress: log.percentage, currentStep: log.step })),
  clearLogs: () => set({ logs: [], installProgress: 0 }),
  installProgress: 0,
  setProgress: (p) => set({ installProgress: p }),
  currentStep: '',
  setCurrentStep: (s) => set({ currentStep: s }),
}))
```

## 任务 2：src/hooks/useInstallLog.ts

```typescript
// Subscribe to "install-log" Tauri events
import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useInstallStore } from '../stores/installStore'
import type { InstallLogPayload } from '../types/ipc'

export function useInstallLog() {
  const appendLog = useInstallStore((s) => s.appendLog)
  useEffect(() => {
    const unlisten = listen<InstallLogPayload>('install-log', (event) => {
      appendLog(event.payload)
    })
    return () => { unlisten.then((fn) => fn()) }
  }, [appendLog])
}
```

## 任务 3：src/components/StepProgress.tsx

步骤进度指示器，显示当前步骤（圆点 + 连线 + 标签）：
- Props: `steps: string[]`, `currentStep: number`（从 0 开始）
- 每个步骤：完成=绿色填充圆，当前=橙色填充圆+脉冲动画，待完成=灰色空心圆
- 步骤之间用连线连接，完成的连线变绿色

## 任务 4：src/components/LogPanel.tsx

实时滚动日志面板：
- Props: `logs: InstallLogPayload[]`, `className?: string`
- 深色背景（#1a1a1a），等宽字体，绿色文字
- 每行显示：`[HH:MM:SS] message`（时间从 timestamp 格式化）
- 自动滚动到最新行（useEffect + ref）
- 最新行有渐入动画

## 任务 5：src/pages/Welcome.tsx（最重要的页面）

欢迎页 = 环境检测 + 一键入口。

**布局**：
```
┌─────────────────────────────────────┐
│  🦞 OpenClaw 安装器           v0.1  │  ← 顶部标题栏（橙棕色背景）
├─────────────────────────────────────┤
│                                     │
│  环境检测                           │
│  ┌──────────┐ ┌──────────┐          │
│  │ ✅ macOS │ │ ✅ Node  │          │  ← 检测卡片网格
│  │ 15.2 arm │ │ v22.14   │          │
│  └──────────┘ └──────────┘          │
│  ┌──────────┐ ┌──────────┐          │
│  │ ❌ OpenC │ │ ❌ Gate  │          │
│  │ 未安装   │ │ 未运行   │          │
│  └──────────┘ └──────────┘          │
│                                     │
│  ┌──────────────────────────────┐   │
│  │   [一键安装]  /  [进入管理]  │   │  ← 操作按钮
│  └──────────────────────────────┘   │
│                                     │
│  ⟳ 正在检测...（loading 状态）      │
└─────────────────────────────────────┘
```

**逻辑**：
1. 组件加载时调用 `invoke("get_system_info")` 获取数据
2. 加载中显示 skeleton 占位
3. 根据 `openclaw_installed` 显示不同按钮：
   - 未安装 → "一键安装" 按钮（主色调）→ 跳转到 /installing
   - 已安装但 gateway 未运行 → "启动 Gateway" + "进入管理"
   - 已安装且运行中 → "进入管理"（跳转 /dashboard，M2 实现）
4. 每 30 秒自动刷新检测结果

**检测卡片**（每张卡片）：
- 图标：✅（绿）/ ❌（红）/ ⚠️（黄）/ ⟳（加载中）
- 标题（检测项名称）
- 值（检测结果或状态描述）

检测项：macOS 版本、Node.js、npm、OpenClaw、Gateway、磁盘空间

## 任务 6：src/pages/Installing.tsx

安装进度页。

**布局**：
```
[进度条：0%→100%]
[步骤指示器：正在安装 Node.js...]
[实时日志面板：滚动显示脚本输出]
[取消按钮（仅在安装进行中显示）]
```

**逻辑**：
1. 进入页面时调用 `invoke("run_install", { scriptName: "install-macos.sh" })`
2. 用 `useInstallLog()` hook 订阅日志事件
3. 从 store 读取 `installProgress` 和 `currentStep` 更新 UI
4. 进度到 100% 后 2 秒自动跳转到 /config-wizard
5. 如果出错（try/catch invoke），显示错误信息 + 重试按钮

## 任务 7：src/pages/ConfigWizard.tsx

4步配置向导。

**步骤**：
1. **AI 模型选择**
   - 提供下拉列表（预设几个常用模型）：
     - `moonshot/kimi-k2.5`（月之暗面 Kimi K2.5，推荐）
     - `openai/gpt-4o`
     - `anthropic/claude-sonnet-4-5`
     - `openrouter/auto`
   - 也可手动输入

2. **API Key 配置**
   - 根据第 1 步选择的 provider，显示对应的 Key 输入框
   - 例如选 moonshot → 显示 `MOONSHOT_API_KEY` 输入框
   - 输入框用 password 类型，右侧有显示/隐藏切换

3. **Telegram 配置（可选）**
   - Bot Token 输入框（placeholder: "从 @BotFather 获取，例如：8699735675:AAF..."）
   - Telegram 用户 ID 输入框（placeholder: "你的 Telegram 数字 ID，例如：956877904"）
   - "跳过 Telegram 配置" 链接

4. **完成确认**
   - 显示配置摘要（不显示完整 key，只显示前 4 字符 + ***）
   - "完成配置" 按钮 → 调用 `invoke("save_config", { config: ... })` → 跳转 /dashboard

**导航**：上一步/下一步按钮，步骤指示器显示当前步骤

## 任务 8：src/App.tsx

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Welcome from './pages/Welcome'
import Installing from './pages/Installing'
import ConfigWizard from './pages/ConfigWizard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/welcome" replace />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/installing" element={<Installing />} />
        <Route path="/config-wizard" element={<ConfigWizard />} />
        {/* /dashboard will be implemented in M2 */}
        <Route path="/dashboard" element={<div className="p-8 text-[var(--text-primary)]">Dashboard（M2 实现）</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

---

## 测试验证

```bash
cd /Users/openclawcn/openclaw-anzhuang
npm run dev
```

在浏览器中打开 http://localhost:1420 检查：
1. 欢迎页显示环境检测卡片（即使 Tauri IPC 未接通，应有 loading 状态或 mock 数据）
2. 路由切换正常（在 URL 里手动改 /installing, /config-wizard 测试）
3. 无 TypeScript 编译错误
4. 颜色主题正确（暖棕色背景）

---

## 完成后记录到里程碑文档

在 `docs/milestones/M1.md` 末尾追加：

```
---
## Agent 4 执行日志（前端页面）

### 测试 [填入日期时间]
命令: npm run dev（然后手动检查 http://localhost:1420）
输出: [填入截图描述或控制台输出]
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入时间]
完成说明: 实现 Welcome/Installing/ConfigWizard 页面、LogPanel/StepProgress 组件、Zustand store、hooks，npm run dev 无报错
```
