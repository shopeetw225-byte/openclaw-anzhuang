# M5 Agent 3 任务：卸载向导（脚本 + Uninstall.tsx）

## 你的角色
你负责实现 **卸载功能**：Shell/PowerShell 卸载脚本 + 卸载向导页面。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `scripts/uninstall-openclaw.sh`（新建，macOS/Linux 通用）
- `scripts/windows/uninstall-openclaw.ps1`（新建）
- `src/pages/Uninstall.tsx`（新建）

> 路由注册由 **Agent 2** 负责（App.tsx 中已加 `/uninstall` 路由）。
> 你只需创建页面和脚本，无需修改 App.tsx。

## 工作规则
- 本机是 macOS，脚本不要求实际运行，但内容必须在目标平台可落地
- 脚本使用 UTF-8（无 BOM）
- 卸载脚本输出必须包含关键字（后端进度匹配）：`Done`

---

## 任务 1：scripts/uninstall-openclaw.sh（macOS/Linux 通用）

三步卸载：停止 Gateway → 卸载 npm 包 → 可选删除数据目录。

```bash
#!/usr/bin/env bash
set -euo pipefail

# ── 可选参数：--purge 同时删除 ~/.openclaw 数据目录 ──────────────────────────
PURGE=false
for arg in "$@"; do
  [[ "$arg" == "--purge" ]] && PURGE=true
done

echo "=== OpenClaw 卸载向导 ==="

# 步骤 1：停止 Gateway
echo "[步骤 1/3] 停止 Gateway 服务..."

# macOS：卸载 LaunchAgent
if [[ "$(uname)" == "Darwin" ]]; then
  PLIST="$HOME/Library/LaunchAgents/com.openclaw.gateway.plist"
  if [[ -f "$PLIST" ]]; then
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "  已移除 LaunchAgent"
  fi
fi

# Linux：停止 systemd user service
if command -v systemctl &>/dev/null; then
  systemctl --user stop openclaw-gateway.service 2>/dev/null || true
  systemctl --user disable openclaw-gateway.service 2>/dev/null || true
  SERVICE_FILE="$HOME/.config/systemd/user/openclaw-gateway.service"
  [[ -f "$SERVICE_FILE" ]] && rm -f "$SERVICE_FILE"
  systemctl --user daemon-reload 2>/dev/null || true
  echo "  已移除 systemd 服务"
fi

# 兜底：直接 kill openclaw gateway 进程
pkill -f "openclaw gateway" 2>/dev/null || true

# 步骤 2：卸载 npm 包
echo "[步骤 2/3] 卸载 openclaw npm 包..."
if command -v npm &>/dev/null; then
  npm uninstall -g openclaw 2>&1 || echo "  npm uninstall 失败（可能已卸载）"
  echo "  openclaw 已从 npm 全局包中移除"
else
  echo "  未找到 npm，跳过"
fi

# 步骤 3：可选删除数据目录
echo "[步骤 3/3] 处理数据目录..."
DATA_DIR="$HOME/.openclaw"
if [[ "$PURGE" == "true" ]]; then
  if [[ -d "$DATA_DIR" ]]; then
    rm -rf "$DATA_DIR"
    echo "  已删除 $DATA_DIR"
  else
    echo "  数据目录不存在，跳过"
  fi
else
  echo "  保留数据目录 $DATA_DIR（如需删除，手动执行 rm -rf ~/.openclaw）"
fi

echo ""
echo "Done"
echo "=== 卸载完成 ==="
```

---

## 任务 2：scripts/windows/uninstall-openclaw.ps1

```powershell
#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$Purge  # 传入 -Purge 则同时删除 $HOME\.openclaw 数据目录
)

$ErrorActionPreference = 'Continue'

Write-Output "=== OpenClaw 卸载向导（Windows）==="

# 步骤 1：停止并注销 Windows 服务（NSSM 管理的 openclaw-gateway）
Write-Output "[步骤 1/3] 停止 Gateway 服务..."

$NssmPath = $null
$NssmLocal = "$HOME\.openclaw\bin\nssm.exe"
if (Test-Path $NssmLocal) {
    $NssmPath = $NssmLocal
} elseif (Get-Command nssm.exe -ErrorAction SilentlyContinue) {
    $NssmPath = (Get-Command nssm.exe).Source
}

$ServiceName = "openclaw-gateway"
if ($NssmPath) {
    & $NssmPath stop $ServiceName 2>$null
    & $NssmPath remove $ServiceName confirm 2>$null
    Write-Output "  已注销 NSSM 服务 $ServiceName"
} else {
    # 尝试原生 sc.exe
    sc.exe stop $ServiceName 2>$null
    sc.exe delete $ServiceName 2>$null
    Write-Output "  尝试用 sc.exe 注销服务（NSSM 未找到）"
}

# 兜底：kill openclaw 进程
Get-Process -Name "node" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*openclaw*gateway*" } |
    Stop-Process -Force -ErrorAction SilentlyContinue

# 步骤 2：卸载 npm 包
Write-Output "[步骤 2/3] 卸载 openclaw npm 包..."
if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm uninstall -g openclaw 2>&1 | Write-Output
    Write-Output "  openclaw 已从 npm 全局包中移除"
} else {
    Write-Output "  未找到 npm，跳过"
}

# 步骤 3：可选删除数据目录
Write-Output "[步骤 3/3] 处理数据目录..."
$DataDir = "$HOME\.openclaw"
if ($Purge) {
    if (Test-Path $DataDir) {
        Remove-Item -Recurse -Force $DataDir
        Write-Output "  已删除 $DataDir"
    } else {
        Write-Output "  数据目录不存在，跳过"
    }
} else {
    Write-Output "  保留数据目录 $DataDir（传入 -Purge 可删除）"
}

Write-Output ""
Write-Output "Done"
Write-Output "=== 卸载完成 ==="
```

---

## 任务 3：src/pages/Uninstall.tsx

三步确认向导：
1. 选择是否删除数据（保留/删除单选）
2. 确认按钮 → 调用 `invoke('run_install', { scriptName })` 执行对应卸载脚本
3. 完成后显示结果，提供"关闭应用"按钮

```tsx
import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import LogPanel from '../components/LogPanel'
import { useInstallLog } from '../hooks/useInstallLog'
import { useInstallStore } from '../stores/installStore'
import type { SystemInfo } from '../stores/installStore'

const isTauri = typeof window !== 'undefined' &&
  (Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__))

type Step = 'confirm' | 'running' | 'done' | 'error'

export default function Uninstall() {
  const navigate = useNavigate()
  const logs = useInstallStore((s) => s.logs)
  const clearLogs = useInstallStore((s) => s.clearLogs)
  useInstallLog()

  const [step, setStep] = useState<Step>('confirm')
  const [purge, setPurge] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startUninstall = useCallback(async () => {
    setStep('running')
    setError(null)
    clearLogs()
    useInstallStore.getState().setProgress(0)
    useInstallStore.getState().setCurrentStep('Uninstalling')

    if (!isTauri) {
      await new Promise((r) => setTimeout(r, 1500))
      setStep('done')
      return
    }

    try {
      // 根据平台选择脚本
      let info = useInstallStore.getState().systemInfo
      if (!info) {
        info = await invoke<SystemInfo>('get_system_info')
        useInstallStore.getState().setSystemInfo(info)
      }

      const wslState = (info as any).wsl_state ?? null
      const isWindows = wslState !== null
      const scriptName = isWindows
        ? 'windows/uninstall-openclaw.ps1'
        : 'uninstall-openclaw.sh'

      // run_install 支持 .sh 和 .ps1，且支持子路径
      await invoke<void>('run_install', { scriptName })
      setStep('done')
      useInstallStore.getState().setProgress(100)
      useInstallStore.getState().setCurrentStep('Done')
    } catch (e) {
      setError(e instanceof Error ? e.message : '卸载失败')
      setStep('error')
    }
  }, [clearLogs, purge])

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg, #f3efe7)' }}>
      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <div className="text-lg font-semibold" style={{ color: 'var(--text-primary, #2c1810)' }}>
            卸载 OpenClaw
          </div>
          {step === 'confirm' && (
            <button
              type="button"
              onClick={() => navigate('/dashboard', { replace: true })}
              className="text-sm"
              style={{ color: 'var(--text-secondary, #6b4c3b)' }}
            >
              ← 返回
            </button>
          )}
        </div>

        {/* 确认步骤 */}
        {step === 'confirm' && (
          <div
            className="rounded-xl p-5"
            style={{ background: 'var(--bg-card, #faf7f2)', border: '1px solid var(--border, #d4c5b5)' }}
          >
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
              此操作将停止 Gateway 服务并从系统中移除 openclaw。
            </p>

            {/* 数据目录选项 */}
            <div className="mb-6">
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary, #2c1810)' }}>
                数据目录（~/.openclaw）
              </p>
              <label className="flex items-center gap-2 text-sm cursor-pointer mb-2"
                style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                <input
                  type="radio"
                  name="purge"
                  checked={!purge}
                  onChange={() => setPurge(false)}
                />
                保留（配置和日志不丢失）
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer"
                style={{ color: 'var(--error, #dc2626)' }}>
                <input
                  type="radio"
                  name="purge"
                  checked={purge}
                  onChange={() => setPurge(true)}
                />
                完全删除（不可恢复）
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={startUninstall}
                className="rounded-lg px-5 py-2 text-sm text-white"
                style={{ background: 'var(--error, #dc2626)' }}
              >
                确认卸载
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard', { replace: true })}
                className="rounded-lg border px-5 py-2 text-sm"
                style={{ border: '1px solid var(--border, #d4c5b5)', color: 'var(--text-secondary, #6b4c3b)', background: 'transparent' }}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 进行中 */}
        {step === 'running' && (
          <div
            className="rounded-xl p-5 mb-4"
            style={{ background: 'var(--bg-card, #faf7f2)', border: '1px solid var(--border, #d4c5b5)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
              卸载进行中，请勿关闭窗口...
            </p>
          </div>
        )}

        {/* 完成 */}
        {step === 'done' && (
          <div
            className="rounded-xl p-5 mb-4"
            style={{ background: 'var(--bg-card, #faf7f2)', border: '1px solid var(--border, #d4c5b5)' }}
          >
            <p className="text-sm mb-4" style={{ color: 'var(--success, #2d7a4f)' }}>
              ✅ 卸载完成。感谢使用 OpenClaw！
            </p>
            <button
              type="button"
              onClick={() => navigate('/welcome', { replace: true })}
              className="rounded-lg px-5 py-2 text-sm text-white"
              style={{ background: 'var(--accent, #c94b1d)' }}
            >
              返回首页
            </button>
          </div>
        )}

        {/* 错误 */}
        {step === 'error' && (
          <div
            className="rounded-xl p-5 mb-4"
            style={{ background: 'var(--bg-card, #faf7f2)', border: '1px solid var(--border, #d4c5b5)' }}
          >
            <p className="text-sm mb-4" style={{ color: 'var(--error, #dc2626)' }}>
              卸载出错：{error}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={startUninstall}
                className="rounded-lg px-5 py-2 text-sm text-white"
                style={{ background: 'var(--accent, #c94b1d)' }}
              >
                重试
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard', { replace: true })}
                className="rounded-lg border px-5 py-2 text-sm"
                style={{ border: '1px solid var(--border, #d4c5b5)', color: 'var(--text-secondary, #6b4c3b)', background: 'transparent' }}
              >
                返回
              </button>
            </div>
          </div>
        )}

        {/* 日志面板 */}
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

> ⚠️ 注意：`purge` 参数目前脚本通过命令行参数传递（`--purge` 或 `-Purge`），但 `run_install` 当前只接受 `scriptName` 不传额外参数。MVP 阶段先固定卸载行为为"保留数据"（不传 purge flag）；如需支持删除数据，后续可扩展 `run_install` 接受 `args` 参数。当前 `purge` 状态仅用于 UI 展示，脚本统一使用保留数据模式。

---

## 测试验证

```bash
cd /Users/openclawcn/openclaw-anzhuang

# 检查关键字
rg -n "Done" scripts/uninstall-openclaw.sh scripts/windows/uninstall-openclaw.ps1

# TypeScript 类型检查
npx tsc --noEmit
```

成功标准：关键字 `Done` 均出现；tsc 零错误。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M5.md` 末尾追加：

```
---
## Agent 3 执行日志（卸载脚本 + Uninstall.tsx）

### 测试 [填入日期时间]
命令: rg -n "Done" scripts/uninstall*.sh scripts/windows/uninstall*.ps1 && npx tsc --noEmit
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: 新建 uninstall-openclaw.sh（macOS/Linux 三步卸载）、uninstall-openclaw.ps1（Windows NSSM+npm）、Uninstall.tsx（三步确认向导）
```
