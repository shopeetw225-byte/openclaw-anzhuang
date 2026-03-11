import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import LogPanel from '../components/LogPanel'
import { useInstallLog } from '../hooks/useInstallLog'
import { useInstallStore } from '../stores/installStore'
import type { UpdateInfo } from '../types/ipc'

const isTauri =
  typeof window !== 'undefined' &&
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

  useEffect(() => {
    if (!updating) return
    if (done) return
    const hit = logs.some((l) => {
      const text = `${l.step} ${l.message}`
      return text.includes('Done') || text.includes('added')
    })
    if (!hit) return
    setDone(true)
    setUpdating(false)
  }, [done, logs, updating])

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

        <div
          className="rounded-xl p-5 mb-4"
          style={{
            background: 'var(--bg-card, #faf7f2)',
            border: '1px solid var(--border, #d4c5b5)',
          }}
        >
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

          {info && (
            <div
              className="text-sm mb-4"
              style={{
                color: info.update_available ? 'var(--warning, #b45309)' : 'var(--success, #2d7a4f)',
              }}
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
              更新完成！重启 Gateway 后生效。
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={checkUpdate}
              disabled={checking || updating}
              className="rounded-lg px-5 py-2 text-sm text-white"
              style={{
                background: 'var(--accent, #c94b1d)',
                opacity: checking || updating ? 0.5 : 1,
              }}
            >
              {checking ? '检查中...' : '检查更新'}
            </button>

            {info?.update_available && !done && (
              <button
                type="button"
                onClick={doUpdate}
                disabled={updating}
                className="rounded-lg px-5 py-2 text-sm text-white"
                style={{
                  background: 'var(--success, #2d7a4f)',
                  opacity: updating ? 0.5 : 1,
                }}
              >
                {updating ? '更新中...' : '一键更新'}
              </button>
            )}
          </div>
        </div>

        {logs.length > 0 && (
          <div className="mt-4">
            <LogPanel logs={logs} />
          </div>
        )}
      </div>
    </div>
  )
}

