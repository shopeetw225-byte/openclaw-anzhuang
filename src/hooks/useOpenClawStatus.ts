import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { OpenClawStatus } from '../types/ipc'

function isTauriRuntime() {
  return (
    typeof window !== 'undefined' &&
    (Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__))
  )
}

export function useOpenClawStatus(refreshIntervalMs = 5_000) {
  const [status, setStatus] = useState<OpenClawStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isTauriRuntime()) {
      setError('未连接到 Tauri（浏览器预览模式）')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await invoke<OpenClawStatus>('get_openclaw_status')
      setStatus(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取状态失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!Number.isFinite(refreshIntervalMs) || refreshIntervalMs <= 0) return
    const id = window.setInterval(() => {
      void refresh()
    }, refreshIntervalMs)
    return () => window.clearInterval(id)
  }, [refresh, refreshIntervalMs])

  return useMemo(
    () => ({
      status,
      loading,
      error,
      refresh,
    }),
    [status, loading, error, refresh],
  )
}
