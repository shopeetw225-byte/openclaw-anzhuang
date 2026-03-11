import { useEffect, useMemo, useRef } from 'react'
import type { InstallLogPayload } from '../stores/installStore'

interface LogPanelProps {
  logs: InstallLogPayload[]
  className?: string
}

function formatTime(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default function LogPanel({ logs, className }: LogPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  const lines = useMemo(
    () =>
      logs.map((log, idx) => ({
        key: `${log.timestamp}-${idx}`,
        text: `[${formatTime(log.timestamp)}] ${log.message}`,
      })),
    [logs],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [logs.length])

  return (
    <div
      className={`rounded-xl border border-[var(--border)] ${className ?? ''}`}
      style={{
        background: '#1a1a1a',
      }}
    >
      <style>
        {`
@keyframes oc-log-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.oc-log-line-latest { animation: oc-log-fade-in 180ms ease-out; }
`}
      </style>

      <div
        ref={containerRef}
        className="max-h-[360px] overflow-auto p-3 text-sm leading-relaxed"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          color: '#22c55e',
        }}
      >
        {lines.length === 0 ? (
          <div style={{ color: '#86efac' }}>等待日志输出...</div>
        ) : (
          lines.map((l, idx) => (
            <div key={l.key} className={idx === lines.length - 1 ? 'oc-log-line-latest' : undefined}>
              {l.text}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

