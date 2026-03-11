type Status = 'running' | 'stopped' | 'unknown'

interface StatusBadgeProps {
  status: Status
  label?: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const configs = {
    running: {
      dot: 'bg-green-500',
      pulse: 'animate-ping bg-green-400',
      text: 'text-green-400',
      defaultLabel: '运行中',
    },
    stopped: {
      dot: 'bg-red-500',
      pulse: '',
      text: 'text-red-400',
      defaultLabel: '已停止',
    },
    unknown: {
      dot: 'bg-gray-500',
      pulse: '',
      text: 'text-gray-400',
      defaultLabel: '未知',
    },
  }

  const cfg = configs[status]
  const displayLabel = label ?? cfg.defaultLabel

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2.5 w-2.5">
        {cfg.pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${cfg.pulse}`}
          />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
      </span>
      <span className={`text-sm font-medium ${cfg.text}`}>{displayLabel}</span>
    </span>
  )
}

