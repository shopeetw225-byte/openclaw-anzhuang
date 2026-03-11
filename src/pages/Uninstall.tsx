import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import LogPanel from '../components/LogPanel'
import { useInstallLog } from '../hooks/useInstallLog'
import { useInstallStore } from '../stores/installStore'
import type { SystemInfo } from '../stores/installStore'

const isTauri =
  typeof window !== 'undefined' &&
  (Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__))

type Step = 'confirm' | 'running' | 'done' | 'error'

export default function Uninstall() {
  const navigate = useNavigate()
  const logs = useInstallStore((s) => s.logs)
  const clearLogs = useInstallStore((s) => s.clearLogs)
  useInstallLog()

  const [step, setStep] = useState<Step>('confirm')
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

      await invoke<void>('run_install', { scriptName })
      setStep('done')
      useInstallStore.getState().setProgress(100)
      useInstallStore.getState().setCurrentStep('Done')
    } catch (e) {
      setError(e instanceof Error ? e.message : '卸载失败')
      setStep('error')
    }
  }, [clearLogs])

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
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
              此操作将停止 Gateway 服务，并从系统中移除 openclaw npm 包。
              数据目录 <code>~/.openclaw</code> 将被保留（如需完全清除，手动删除该目录）。
            </p>

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
                style={{
                  border: '1px solid var(--border, #d4c5b5)',
                  color: 'var(--text-secondary, #6b4c3b)',
                  background: 'transparent',
                }}
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
                style={{
                  border: '1px solid var(--border, #d4c5b5)',
                  color: 'var(--text-secondary, #6b4c3b)',
                  background: 'transparent',
                }}
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
