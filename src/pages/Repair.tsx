import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useNavigate } from 'react-router-dom'
import type { DiagnosisItem, RepairResult } from '../types/ipc'
import type { InstallLogPayload } from '../stores/installStore'

const isTauri = typeof window !== 'undefined' &&
  (Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__))

const MOCK_DIAGNOSIS: RepairResult = {
  fixed_count: 0,
  summary: '2 项检测未通过',
  items: [
    { check_name: 'OpenClaw 安装', passed: true, message: 'openclaw 命令可用', auto_fixable: false },
    { check_name: '端口 18789', passed: false, message: '端口 18789 未监听', auto_fixable: true },
    { check_name: 'LaunchAgent', passed: false, message: 'LaunchAgent 未加载', auto_fixable: true },
    { check_name: '配置文件', passed: true, message: 'openclaw.json 格式正确', auto_fixable: false },
    { check_name: '错误日志', passed: true, message: '最近日志无严重错误', auto_fixable: false },
  ],
}

type RepairOp = 'doctor' | 'gateway_reinstall' | 'sessions_cleanup'

export default function Repair() {
  const navigate = useNavigate()

  // ── 快速诊断 state ──────────────────────────────────────────────
  const [diagResult, setDiagResult] = useState<RepairResult | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagMode, setDiagMode] = useState<'idle' | 'diagnosed' | 'fixed'>('idle')

  // ── 官方修复 state ──────────────────────────────────────────────
  const [activeOp, setActiveOp] = useState<RepairOp | null>(null)
  const [opLogs, setOpLogs] = useState<InstallLogPayload[]>([])
  const [opError, setOpError] = useState<string | null>(null)
  const [opDone, setOpDone] = useState(false)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll log panel
  useEffect(() => {
    const el = logContainerRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [opLogs.length])

  // ── 快速诊断 handlers ───────────────────────────────────────────
  async function runDiagnosis() {
    setDiagLoading(true)
    try {
      const r = isTauri
        ? await invoke<RepairResult>('run_diagnosis')
        : MOCK_DIAGNOSIS
      setDiagResult(r)
      setDiagMode('diagnosed')
    } catch (e) {
      console.error(e)
    } finally {
      setDiagLoading(false)
    }
  }

  async function runAutoFix() {
    setDiagLoading(true)
    try {
      const r = isTauri
        ? await invoke<RepairResult>('auto_fix')
        : { ...MOCK_DIAGNOSIS, fixed_count: 2, summary: '自动修复完成，修复了 2 项' }
      setDiagResult(r)
      setDiagMode('fixed')
    } catch (e) {
      console.error(e)
    } finally {
      setDiagLoading(false)
    }
  }

  const hasFixable = diagResult?.items.some(i => !i.passed && i.auto_fixable) ?? false

  // ── 官方修复 handlers ───────────────────────────────────────────
  async function runOp(op: RepairOp) {
    setActiveOp(op)
    setOpLogs([])
    setOpError(null)
    setOpDone(false)

    const cmd =
      op === 'doctor' ? 'run_doctor'
      : op === 'gateway_reinstall' ? 'run_gateway_reinstall'
      : 'run_sessions_cleanup'

    if (!isTauri) {
      // Mock stream for browser preview
      const msgs = [
        '正在连接 OpenClaw 服务…',
        '检测网络状态…',
        '检查配置文件…',
        '操作完成 ✓',
      ]
      for (const m of msgs) {
        await new Promise(r => setTimeout(r, 400))
        setOpLogs(prev => [...prev, { step: op, percentage: 0, message: m, timestamp: Date.now() }])
      }
      setOpDone(true)
      return
    }

    let unlisten: (() => void) | null = null
    try {
      unlisten = await listen<InstallLogPayload>('install-log', (event) => {
        setOpLogs(prev => [...prev, event.payload])
      })
      await invoke(cmd)
      setOpDone(true)
    } catch (e) {
      setOpError(String(e))
    } finally {
      unlisten?.()
    }
  }

  function resetOp() {
    setActiveOp(null)
    setOpLogs([])
    setOpError(null)
    setOpDone(false)
  }

  function formatTime(ts: number) {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  const opLabel: Record<RepairOp, string> = {
    doctor: 'openclaw doctor',
    gateway_reinstall: 'gateway install --force',
    sessions_cleanup: 'sessions cleanup',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '24px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        {/* Back */}
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            ← 返回控制台
          </button>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>诊断与修复</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28 }}>
          检测运行环境，或使用 OpenClaw 官方命令深度修复
        </p>

        {/* ── Section 1: 快速诊断 ───────────────────────────── */}
        <SectionCard title="快速诊断">
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <RepairBtn
              onClick={runDiagnosis}
              disabled={diagLoading}
              variant="primary"
              style={{ flex: 1 }}
            >
              {diagLoading && diagMode === 'idle' ? '检测中…' : '开始诊断'}
            </RepairBtn>
            {diagMode === 'diagnosed' && hasFixable && (
              <RepairBtn
                onClick={runAutoFix}
                disabled={diagLoading}
                variant="warning"
                style={{ flex: 1 }}
              >
                {diagLoading ? '修复中…' : '一键修复'}
              </RepairBtn>
            )}
          </div>

          {diagResult && (
            <div style={{
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 12,
              fontSize: 13,
              fontWeight: 500,
              background: diagMode === 'fixed' || diagResult.items.every(i => i.passed)
                ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.1)',
              color: diagMode === 'fixed' || diagResult.items.every(i => i.passed)
                ? '#4ade80' : '#fb923c',
              border: `1px solid ${diagMode === 'fixed' || diagResult.items.every(i => i.passed) ? 'rgba(34,197,94,0.3)' : 'rgba(249,115,22,0.3)'}`,
            }}>
              {diagResult.summary}
              {diagMode === 'fixed' && diagResult.fixed_count > 0 && (
                <span style={{ marginLeft: 4 }}>（已修复 {diagResult.fixed_count} 项）</span>
              )}
            </div>
          )}

          {diagResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {diagResult.items.map((item, i) => (
                <DiagnosisCard key={i} item={item} />
              ))}
            </div>
          )}

          {!diagResult && !diagLoading && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              点击「开始诊断」检测运行环境
            </div>
          )}
        </SectionCard>

        {/* ── Section 2: OpenClaw 官方修复 ──────────────────── */}
        <SectionCard title="OpenClaw 官方修复" style={{ marginTop: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            以下命令来自 OpenClaw 官方 CLI，可深度修复常见故障。
          </p>

          {activeOp ? (
            <div>
              {/* Running header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 8,
              }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {opLabel[activeOp]}
                </span>
                {(opDone || opError) && (
                  <button
                    onClick={resetOp}
                    style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    ← 返回
                  </button>
                )}
              </div>

              {/* Log output */}
              <div
                ref={logContainerRef}
                style={{
                  background: '#111',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 12,
                  maxHeight: 240,
                  overflowY: 'auto',
                  fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: opError ? '#f87171' : '#4ade80',
                }}
              >
                {opLogs.length === 0 && !opError ? (
                  <span style={{ color: '#6b7280' }}>正在执行，等待输出…</span>
                ) : (
                  opLogs.map((log, idx) => (
                    <div key={idx}>[{formatTime(log.timestamp)}] {log.message}</div>
                  ))
                )}
                {opError && (
                  <div style={{ marginTop: 8, color: '#f87171' }}>错误：{opError}</div>
                )}
                {opDone && (
                  <div style={{ marginTop: 8, color: '#86efac', fontWeight: 600 }}>✓ 操作完成</div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <RepairOpRow
                label="全面健康检查"
                sub="openclaw doctor — 自动检测并修复常见问题"
                onClick={() => runOp('doctor')}
              />
              <RepairOpRow
                label="重新注册开机自启"
                sub="openclaw gateway install --force — 重新安装 LaunchAgent/服务"
                onClick={() => runOp('gateway_reinstall')}
              />
              <RepairOpRow
                label="清理孤儿会话"
                sub="openclaw sessions cleanup — 清除异常残留会话"
                onClick={() => runOp('sessions_cleanup')}
              />
            </div>
          )}
        </SectionCard>

        {/* ── Section 3: 卸载 ───────────────────────────────── */}
        <SectionCard title="卸载 OpenClaw" style={{ marginTop: 16 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            彻底移除 OpenClaw 及其所有配置文件和服务。此操作不可撤销。
          </p>
          <RepairBtn
            onClick={() => navigate('/uninstall')}
            variant="danger"
          >
            进入卸载向导 →
          </RepairBtn>
        </SectionCard>

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ title, children, style }: {
  title: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 20,
      ...style,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--text)' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function RepairBtn({ onClick, disabled, variant = 'primary', children, style }: {
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'warning' | 'danger' | 'ghost'
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const colors: Record<string, { bg: string; hover: string; text: string }> = {
    primary: { bg: '#2563eb', hover: '#1d4ed8', text: '#fff' },
    warning: { bg: '#c2410c', hover: '#9a3412', text: '#fff' },
    danger:  { bg: '#991b1b', hover: '#7f1d1d', text: '#fca5a5' },
    ghost:   { bg: 'transparent', hover: 'rgba(255,255,255,0.06)', text: 'var(--text-muted)' },
  }
  const c = colors[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 16px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        background: c.bg,
        color: c.text,
        border: variant === 'ghost' ? '1px solid var(--border)' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.15s',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function RepairOpRow({ label, sub, onClick }: {
  label: string
  sub: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        transition: 'border-color 0.15s',
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {sub}
        </div>
      </div>
      <span style={{ fontSize: 16, color: 'var(--text-muted)', marginLeft: 12 }}>›</span>
    </button>
  )
}

function DiagnosisCard({ item }: { item: DiagnosisItem }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '10px 12px',
      borderRadius: 8,
      border: `1px solid ${item.passed ? 'var(--border)' : 'rgba(239,68,68,0.3)'}`,
      background: item.passed ? 'var(--bg)' : 'rgba(239,68,68,0.05)',
    }}>
      <span style={{ fontSize: 15, marginTop: 1, color: item.passed ? '#4ade80' : '#f87171' }}>
        {item.passed ? '✓' : '✗'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: item.passed ? 'var(--text)' : '#fca5a5', margin: 0 }}>
          {item.check_name}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
          {item.message}
        </p>
      </div>
      {!item.passed && item.auto_fixable && (
        <span style={{
          fontSize: 10,
          padding: '2px 6px',
          background: 'rgba(249,115,22,0.15)',
          color: '#fb923c',
          border: '1px solid rgba(249,115,22,0.3)',
          borderRadius: 4,
          whiteSpace: 'nowrap',
        }}>
          可自动修复
        </span>
      )}
    </div>
  )
}
