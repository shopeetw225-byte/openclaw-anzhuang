import { useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import { useInstallLog } from '../hooks/useInstallLog'
import { useInstallStore } from '../stores/installStore'
import type { InstallLogPayload } from '../stores/installStore'

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
  const [purge, setPurge] = useState(false)
  const [dryRun, setDryRun] = useState(false)
  const [selectMode, setSelectMode] = useState(false)

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
      await invoke<void>('run_uninstall', { purge: !dryRun && purge, dry_run: dryRun, select_mode: selectMode })
      setStep('done')
      useInstallStore.getState().setProgress(100)
      useInstallStore.getState().setCurrentStep('Done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStep('error')
    }
  }, [clearLogs, purge, dryRun, selectMode])

  return (
    <div style={{ minHeight: '100vh', background: '#F2F2F7' }}>

      {/* Nav */}
      <div style={{
        background: 'rgba(242,242,247,0.92)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '0.5px solid rgba(60,60,67,0.2)',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#000' }}>卸载 OpenClaw</span>
        {step === 'confirm' && (
          <button
            onClick={() => navigate('/dashboard', { replace: true })}
            style={{ background: 'none', border: 'none', color: '#007AFF', fontSize: 13, cursor: 'pointer' }}
          >
            ← 返回
          </button>
        )}
      </div>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '20px' }}>

        {/* 确认 */}
        {step === 'confirm' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <p style={{ fontSize: 14, color: '#636366', marginBottom: 20, lineHeight: 1.6 }}>
              此操作将停止 Gateway 服务，并从系统中移除 openclaw npm 包。
            </p>

            {/* 选项列表 */}
            <div style={{
              borderRadius: 10,
              border: '0.5px solid rgba(60,60,67,0.18)',
              overflow: 'hidden',
              marginBottom: 24,
            }}>
              <OptionRow
                icon="🗑️"
                title="卸载程序"
                desc="停止 Gateway，移除 openclaw npm 包及 LaunchAgent"
                checked={true}
                disabled
              />
              <OptionRow
                icon="🗂️"
                title="同时删除配置和数据"
                desc={`删除 ~/.openclaw 目录（API Key、会话记录、日志等）`}
                checked={purge}
                onChange={setPurge}
                warn
              />
            </div>

            {purge && (
              <div style={{
                marginBottom: 20,
                padding: '10px 14px',
                background: 'rgba(255,59,48,0.06)',
                border: '1px solid rgba(255,59,48,0.2)',
                borderRadius: 8,
                fontSize: 12,
                color: '#FF3B30',
                lineHeight: 1.5,
              }}>
                ⚠️ 已选择删除数据目录，操作不可撤销。
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={startUninstall}
                style={{
                  padding: '10px 22px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  background: '#FF3B30',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                确认卸载
              </button>
              <button
                onClick={() => navigate('/dashboard', { replace: true })}
                style={{
                  padding: '10px 22px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 500,
                  background: 'rgba(0,122,255,0.08)',
                  color: '#007AFF',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 进行中 */}
        {step === 'running' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <SpinnerDot />
              <span style={{ fontSize: 15, fontWeight: 600 }}>卸载进行中</span>
            </div>
            <p style={{ fontSize: 13, color: '#636366', margin: 0 }}>请勿关闭窗口...</p>
          </div>
        )}

        {/* 完成 */}
        {step === 'done' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#34C759', marginBottom: 8 }}>
              ✓ 卸载完成
            </div>
            <p style={{ fontSize: 13, color: '#636366', marginBottom: 16 }}>
              OpenClaw 已从系统中移除。感谢使用！
            </p>
            <button
              onClick={() => navigate('/welcome', { replace: true })}
              style={{
                padding: '10px 22px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                background: '#007AFF',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              返回首页
            </button>
          </div>
        )}

        {/* 失败 */}
        {step === 'error' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#FF3B30', marginBottom: 8 }}>
              卸载出错
            </div>
            <p style={{ fontSize: 13, color: '#636366', marginBottom: 16 }}>{error}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={startUninstall}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: '#007AFF', color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >
                重试
              </button>
              <button
                onClick={() => navigate('/dashboard', { replace: true })}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontSize: 13,
                  background: 'rgba(60,60,67,0.08)', color: '#636366', border: 'none', cursor: 'pointer',
                }}
              >
                返回
              </button>
            </div>
          </div>
        )}

        {/* 日志 */}
        {logs.length > 0 && (
          <div style={{
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            overflow: 'hidden',
            marginTop: 4,
          }}>
            <LogLines logs={logs} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function OptionRow({ icon, title, desc, checked, onChange, disabled, warn }: {
  icon: string
  title: string
  desc: string
  checked: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
  warn?: boolean
}) {
  return (
    <div
      onClick={() => !disabled && onChange?.(!checked)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '13px 16px',
        background: checked && warn ? 'rgba(255,59,48,0.03)' : '#fff',
        borderTop: '0.5px solid rgba(60,60,67,0.12)',
        cursor: disabled ? 'default' : 'pointer',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 18, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#000', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#636366', lineHeight: 1.4 }}>{desc}</div>
      </div>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: checked ? (warn ? '#FF3B30' : '#34C759') : 'rgba(60,60,67,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 2,
        transition: 'background 0.15s',
      }}>
        {checked && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>✓</span>}
      </div>
    </div>
  )
}

function SpinnerDot() {
  return (
    <>
      <style>{`
        @keyframes un-spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        border: '2px solid rgba(0,122,255,0.15)',
        borderTopColor: '#007AFF',
        animation: 'un-spin 0.7s linear infinite',
        flexShrink: 0,
      }} />
    </>
  )
}

function LogLines({ logs }: { logs: InstallLogPayload[] }) {
  function formatTime(ts: number) {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  return (
    <div style={{
      maxHeight: 240,
      overflowY: 'auto',
      padding: '10px 14px',
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: 11,
      lineHeight: 1.7,
      color: '#3C3C43',
    }}>
      {logs.map((log, i) => (
        <div key={i} style={{ wordBreak: 'break-all' }}>
          [{formatTime(log.timestamp)}] {log.message}
        </div>
      ))}
    </div>
  )
}
