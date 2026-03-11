import React from 'react'

interface StepProgressProps {
  steps: string[]
  currentStep: number
}

export default function StepProgress({ steps, currentStep }: StepProgressProps) {
  const safeCurrent = Math.min(Math.max(currentStep, 0), Math.max(steps.length - 1, 0))

  return (
    <div className="w-full">
      <style>
        {`
@keyframes oc-step-pulse {
  0% { transform: scale(0.9); opacity: 0.65; }
  70% { transform: scale(1.6); opacity: 0; }
  100% { transform: scale(1.6); opacity: 0; }
}
`}
      </style>

      <div className="flex w-full items-start">
        {steps.map((label, idx) => {
          const isCompleted = idx < safeCurrent
          const isCurrent = idx === safeCurrent

          const circleStyle: React.CSSProperties = isCompleted
            ? { background: 'var(--success, #2d7a4f)', border: '2px solid var(--success, #2d7a4f)' }
            : isCurrent
              ? { background: 'var(--accent, #c94b1d)', border: '2px solid var(--accent, #c94b1d)' }
              : { background: 'transparent', border: '2px solid var(--border, #d4c5b5)' }

          const labelStyle: React.CSSProperties = {
            color: isCurrent ? 'var(--text-primary, #2c1810)' : 'var(--text-secondary, #6b4c3b)',
          }

          const lineStyle: React.CSSProperties = {
            height: 2,
            marginTop: 7,
            flex: 1,
            background: idx < safeCurrent ? 'var(--success, #2d7a4f)' : 'var(--border, #d4c5b5)',
          }

          return (
            <div key={`${label}-${idx}`} className="flex flex-1 items-start">
              <div className="flex w-[88px] flex-col items-center text-center">
                <div className="relative h-[14px] w-[14px] rounded-full" style={circleStyle}>
                  {isCurrent ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-1/2 top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{
                        background: 'var(--accent, #c94b1d)',
                        animation: 'oc-step-pulse 1.4s ease-out infinite',
                      }}
                    />
                  ) : null}
                </div>
                <div className="mt-2 text-xs leading-snug" style={labelStyle}>
                  {label}
                </div>
              </div>
              {idx === steps.length - 1 ? null : <div aria-hidden="true" style={lineStyle} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

