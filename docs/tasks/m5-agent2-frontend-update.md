# M5 Agent 2 任务：前端更新页（Update.tsx）+ 路由 + Dashboard 入口

## 你的角色
你负责实现 **更新页面**，在 Dashboard 添加"检查更新"入口，并同时在 App.tsx 注册 `/update` 和 `/uninstall` 路由（Agent 3 创建 Uninstall.tsx，你负责接入路由）。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src/pages/Update.tsx`（新建）
- `src/pages/Dashboard.tsx`（追加"检查更新"按钮区域）
- `src/App.tsx`（追加 /update 和 /uninstall 路由 + import）

## 工作规则
- 不修改 Welcome.tsx、Installing.tsx、Repair.tsx、ConfigWizard.tsx
- UI 风格与现有页面一致：使用 CSS 变量（`--bg`、`--accent`、`--border` 等）
- 浏览器预览模式（非 Tauri 环境）需有 Mock 数据，不能崩溃

---

## 任务 1：新建 src/pages/Update.tsx

功能：
1. 点击"检查更新"→ `invoke<UpdateInfo>('check_update')`
2. 显示当前版本 vs 最新版本
3. 若有新版本：显示"一键更新"按钮 → `invoke<void>('do_update')`
4. 更新过程复用现有 `useInstallLog` hook（监听 install-log 事件）和 `LogPanel` 组件
5. 更新完成后（log 包含 `Done` 或 `added`）显示"更新完成"

```tsx
import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import LogPanel from '../components/LogPanel'
import { useInstallLog } from '../hooks/useInstallLog'
import { useInstallStore } from '../stores/installStore'
import type { UpdateInfo } from '../types/ipc'

const isTauri = typeof window !== 'undefined' &&
  (Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__))

const MOCK_UPDATE: UpdateInfo = {
  current_version: '2026.3.2',
  latest_version: '2026.4.1',
  update_available: true,
}

export default function Update() {
  const navigate = useNavigate()
  const logs = useInstallStore((s) => s.logs)
  const clearLogs = useInstallStore((s) => s.clearLogs)
  useInstallLog()

  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkUpdate = useCallback(async () => {
    setChecking(true)
    setError(null)
    setInfo(null)
    try {
      if (!isTauri) {
        await new Promise((r) => setTimeout(r, 600))
        setInfo(MOCK_UPDATE)
        return
      }
      const result = await invoke<UpdateInfo>('check_update')
      setInfo(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : '检查失败')
    } finally {
      setChecking(false)
    }
  }, [])

  const doUpdate = useCallback(async () => {
    setUpdating(true)
    setDone(false)
    setError(null)
    clearLogs()
    useInstallStore.getState().setProgress(0)
    useInstallStore.getState().setCurrentStep('Updating')
    try {
      if (!isTauri) {
        await new Promise((r) => setTimeout(r, 1500))
        setDone(true)
        return
      }
      await invoke<void>('do_update')
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失败')
    } finally {
      setUpdating(false)
    }
  }, [clearLogs])

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg, #f3efe7)' }}>
      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-6">
          <div className="text-lg font-semibold" style={{ color: 'var(--text-primary, #2c1810)' }}>
            检查更新
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard', { replace: true })}
            className="text-sm"
            style={{ color: 'var(--text-secondary, #6b4c3b)' }}
          >
            ← 返回
          </button>
        </div>

        {/* 版本卡片 */}
        <div
          className="rounded-xl p-5 mb-4"
          style={{ background: 'var(--bg-card, #faf7f2)', border: '1px solid var(--border, #d4c5b5)' }}
        >
          {/* 当前版本 */}
          <div className="flex justify-between text-sm mb-3">
            <span style={{ color: 'var(--text-secondary, #6b4c3b)' }}>当前版本</span>
            <span style={{ color: 'var(--text-primary, #2c1810)', fontWeight: 600 }}>
              {info?.current_version ?? '—'}
            </span>
          </div>
          <div className="flex justify-between text-sm mb-5">
            <span style={{ color: 'var(--text-secondary, #6b4c3b)' }}>最新版本</span>
            <span style={{ color: 'var(--text-primary, #2c1810)', fontWeight: 600 }}>
              {info?.latest_version ?? '—'}
            </span>
          </div>

          {/* 状态文字 */}
          {info && (
            <div
              className="text-sm mb-4"
              style={{ color: info.update_available ? 'var(--warning, #b45309)' : 'var(--success, #2d7a4f)' }}
            >
              {info.update_available ? '有新版本可更新' : '已是最新版本'}
            </div>
          )}
          {error && (
            <div className="text-sm mb-4" style={{ color: 'var(--error, #dc2626)' }}>
              {error}
            </div>
          )}
          {done && (
            <div className="text-sm mb-4" style={{ color: 'var(--success, #2d7a4f)' }}>
              ✅ 更新完成！重启 Gateway 后生效。
            </div>
          )}

          {/* 按钮区域 */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={checkUpdate}
              disabled={checking || updating}
              className="rounded-lg px-5 py-2 text-sm text-white"
              style={{ background: 'var(--accent, #c94b1d)', opacity: (checking || updating) ? 0.5 : 1 }}
            >
              {checking ? '检查中...' : '检查更新'}
            </button>

            {info?.update_available && !done && (
              <button
                type="button"
                onClick={doUpdate}
                disabled={updating}
                className="rounded-lg px-5 py-2 text-sm text-white"
                style={{ background: 'var(--success, #2d7a4f)', opacity: updating ? 0.5 : 1 }}
              >
                {updating ? '更新中...' : '一键更新'}
              </button>
            )}
          </div>
        </div>

        {/* 日志面板（更新过程实时输出） */}
        {logs.length > 0 && (
          <div className="mt-4">
            <LogPanel logs={logs} />
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## 任务 2：Dashboard.tsx 追加"检查更新"按钮

在 Dashboard.tsx 找到导航按钮区（通常是"诊断修复"和"配置向导"按钮所在的 `div`），在其末尾追加一个"检查更新"按钮：

```tsx
<button
  type="button"
  onClick={() => navigate('/update')}
  className="rounded-lg border px-5 py-2 text-sm"
  style={{
    border: '1px solid var(--border, #d4c5b5)',
    color: 'var(--text-secondary, #6b4c3b)',
    background: 'transparent',
  }}
>
  检查更新
</button>
```

需要在 Dashboard.tsx 文件顶部 import useNavigate（如果还没有）并在组件内调用 `const navigate = useNavigate()`（如果还没有）。

---

## 任务 3：App.tsx 追加两个路由

在现有 import 区末尾追加：

```tsx
import Update from './pages/Update'
import Uninstall from './pages/Uninstall'
```

在 `<Routes>` 内现有 `/repair` 路由之后追加：

```tsx
<Route path="/update" element={<Update />} />
<Route path="/uninstall" element={<Uninstall />} />
```

> ⚠️ Uninstall.tsx 由 Agent 3 创建；你只需 import 并注册路由，若 Agent 3 尚未完成文件，先建一个最小占位文件：
> ```tsx
> // src/pages/Uninstall.tsx 占位（Agent 3 会替换）
> export default function Uninstall() {
>   return <div style={{ padding: 32 }}>卸载向导（开发中）</div>
> }
> ```

---

## 测试验证

```bash
cd /Users/openclawcn/openclaw-anzhuang
npx tsc --noEmit
```

成功标准：零 TS 错误。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M5.md` 末尾追加：

```
---
## Agent 2 执行日志（前端更新页 Update.tsx + 路由）

### 测试 [填入日期时间]
命令: npx tsc --noEmit
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: 新建 Update.tsx（check/do update UI）；Dashboard 追加"检查更新"按钮；App.tsx 注册 /update + /uninstall 路由
```
