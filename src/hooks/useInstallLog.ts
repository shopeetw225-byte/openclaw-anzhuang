import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useInstallStore } from '../stores/installStore'
import type { InstallLogPayload } from '../stores/installStore'

function isTauriRuntime() {
  return (
    typeof window !== 'undefined' &&
    (Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__))
  )
}

export function useInstallLog() {
  const appendLog = useInstallStore((s) => s.appendLog)

  useEffect(() => {
    if (!isTauriRuntime()) return

    let unlisten: (() => void) | null = null
    let disposed = false

    listen<InstallLogPayload>('install-log', (event) => {
      if (disposed) return
      appendLog(event.payload)
    })
      .then((fn) => {
        unlisten = fn
      })
      .catch(() => {
        // Ignore when running in a non-Tauri browser preview.
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [appendLog])
}

