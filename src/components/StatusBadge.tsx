type Status = 'running' | 'stopped' | 'unknown'

interface StatusBadgeProps {
  status: Status
  label?: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const cfg = {
    running: { color: '#34C759', defaultLabel: '运行中', pulse: true },
    stopped: { color: '#FF3B30', defaultLabel: '已停止', pulse: false },
    unknown: { color: '#AEAEB2', defaultLabel: '未知',   pulse: false },
  }[status]

  const displayLabel = label ?? cfg.defaultLabel

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ position: 'relative', display: 'inline-flex', width: 9, height: 9 }}>
        {cfg.pulse && (
          <span style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            background: cfg.color,
            opacity: 0.4,
            animation: 'sb-pulse 1.5s ease-in-out infinite',
          }} />
        )}
        <span style={{
          position: 'relative',
          width: 9, height: 9,
          borderRadius: '50%',
          background: cfg.color,
          display: 'block',
        }} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, color: cfg.color }}>{displayLabel}</span>
      <style>{`
        @keyframes sb-pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </span>
  )
}
