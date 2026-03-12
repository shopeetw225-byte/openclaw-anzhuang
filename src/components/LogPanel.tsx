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
      className={className}
      style={{
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}
    >
      <style>{`
@keyframes oc-log-fade-in {
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0); }
}
.oc-log-line-latest { animation: oc-log-fade-in 160ms ease-out; }
`}</style>

      <div
        ref={containerRef}
        style={{
          maxHeight: 320,
          overflowY: 'auto',
          padding: '10px 14px',
          fontSize: 11,
          lineHeight: 1.7,
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
          color: '#3C3C43',
        }}
      >
        {lines.length === 0 ? (
          <div style={{ color: '#AEAEB2' }}>等待日志输出...</div>
        ) : (
          lines.map((l, idx) => (
            <div
              key={l.key}
              className={idx === lines.length - 1 ? 'oc-log-line-latest' : undefined}
              style={{ wordBreak: 'break-all' }}
            >
              {l.text}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
