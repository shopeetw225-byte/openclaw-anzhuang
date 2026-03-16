import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import type { GatewayDetailedStatus, LogEntry } from '../types/ipc'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const GATEWAY_HOST = '127.0.0.1'

const MOCK_STATUS: GatewayDetailedStatus = {
  installed: true,
  version: '1.2.3',
  gateway_running: true,
  gateway_port: 18789,
  gateway_pid: 12345,
  uptime_seconds: 3661,
  launchagent_loaded: true,
}

const MOCK_LOGS: LogEntry[] = [
  { line: '2026-03-11T01:44:53.416Z [telegram] fetch fallback: forcing autoSelectFamily=false' },
  { line: '2026-03-11T01:45:03.912Z [telegram] deleteWebhook failed: Network request failed!' },
  { line: '2026-03-11T14:47:35.174+08:00 [tools] browser failed: Error: No pages available in the connected browser.' },
  { line: '2026-03-11T07:45:56.472Z [memory] fts unavailable: no such module: fts5' },
  { line: '2026-03-11T09:44:19.000Z Gateway started on port 18789' },
]

// ── Log classification ───────────────────────────────────────────────────────

type LogFilter = 'all' | 'error' | 'telegram' | 'tools'

function getLogTag(line: string): 'telegram' | 'tools' | 'memory' | 'fatal' | 'normal' {
  if (line.includes('[telegram]')) return 'telegram'
  if (line.includes('[tools]') || line.includes('[memory]')) return 'tools'
  if (line.includes('FATAL')) return 'fatal'
  return 'normal'
}

/** True errors: exclude routine telegram network noise */
function isRealError(line: string): boolean {
  if (line.includes('[telegram]')) return false
  return (
    line.includes('FATAL') ||
    line.includes('Error:') ||
    line.includes('error:') ||
    (line.includes('failed') && !line.includes('[telegram]'))
  )
}

function matchesFilter(line: string, filter: LogFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'telegram') return line.includes('[telegram]')
  if (filter === 'tools') return line.includes('[tools]') || line.includes('[memory]')
  if (filter === 'error') return isRealError(line)
  return true
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDateTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<GatewayDetailedStatus | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [logFilter, setLogFilter] = useState<LogFilter>('all')

  const fetchStatus = useCallback(async () => {
    if (!isTauri) {
      setStatus(MOCK_STATUS)
      setLogs(MOCK_LOGS)
      return
    }
    try {
      const [s, l] = await Promise.all([
        invoke<GatewayDetailedStatus>('get_detailed_status'),
        invoke<LogEntry[]>('read_logs', { lines: 50 }),
      ])
      setStatus(s)
      setLogs(l)
    } catch (e) {
      console.error('获取状态失败', e)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 5000)
    return () => clearInterval(id)
  }, [fetchStatus])

  async function handleAction(action: 'start_gateway' | 'stop_gateway' | 'restart_gateway') {
    setLoading(true)
    setActionMsg(null)
    try {
      await invoke(action)
      const label = action === 'start_gateway' ? '已启动' : action === 'stop_gateway' ? '已停止' : '已重启'
      setActionMsg({ text: label, ok: true })
      await fetchStatus()
    } catch (e) {
      setActionMsg({ text: `操作失败：${e}`, ok: false })
    } finally {
      setLoading(false)
    }
  }

  const running = status?.gateway_running ?? false
  const startedAt =
    status?.uptime_seconds == null ? '—' : formatDateTime(Date.now() - status.uptime_seconds * 1000)

  // Tab counts
  const errorCount = logs.filter(l => isRealError(l.line)).length
  const telegramCount = logs.filter(l => l.line.includes('[telegram]')).length
  const toolsCount = logs.filter(l => l.line.includes('[tools]') || l.line.includes('[memory]')).length
  const filteredLogs = logs.filter(l => matchesFilter(l.line, logFilter))

  return (
    <div style={{ minHeight: '100vh', background: '#F2F2F7' }}>

      {/* ── Nav Bar ── */}
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: '#000', letterSpacing: -0.3 }}>
            OpenClaw 控制台
          </span>
          {status?.version && (
            <span style={{ fontSize: 12, color: '#AEAEB2' }}>v{status.version}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {[
            { label: '诊断修复', path: '/repair' },
            { label: '修改配置', path: '/config-wizard' },
            { label: '检查更新', path: '/update' },
          ].map(({ label, path }) => (
            <NavBtn key={path} onClick={() => navigate(path)}>{label}</NavBtn>
          ))}
          <button
            onClick={() => navigate('/agent')}
            style={{
              padding: '5px 11px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              background: '#007AFF',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              letterSpacing: 0.2,
            }}
          >
            AI 助手
          </button>
          <NavBtn onClick={fetchStatus}>↺ 刷新</NavBtn>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '16px 20px', maxWidth: 860, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 12, alignItems: 'start' }}>

        {/* ── Left Column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Status Card */}
          <Card>
            {/* Status row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StatusDot running={running} pulse={running} />
                <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>Gateway</span>
                <span style={{ fontSize: 13, color: running ? '#34C759' : '#FF3B30', fontWeight: 500 }}>
                  {running ? '运行中' : '已停止'}
                </span>
              </div>
              {status?.gateway_pid && (
                <span style={{ fontSize: 12, color: '#AEAEB2', fontFamily: 'monospace' }}>
                  PID {status.gateway_pid}
                </span>
              )}
            </div>

            {/* Control buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <CtrlBtn
                label="启动"
                color="#34C759"
                disabled={loading || running}
                onClick={() => handleAction('start_gateway')}
              />
              <CtrlBtn
                label="停止"
                color="#FF3B30"
                disabled={loading || !running}
                onClick={() => handleAction('stop_gateway')}
              />
              <CtrlBtn
                label="重启"
                color="#FF9500"
                disabled={loading || !status}
                onClick={() => handleAction('restart_gateway')}
              />
            </div>

            {actionMsg && (
              <div style={{
                marginTop: 10,
                fontSize: 13,
                color: actionMsg.ok ? '#34C759' : '#FF3B30',
              }}>
                {actionMsg.text}
              </div>
            )}
          </Card>

          {/* Info List */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <InfoRow label="Gateway 地址" value={status ? `${GATEWAY_HOST}:${status.gateway_port}` : '—'} mono />
            <InfoRow
              label="启动时间"
              value={startedAt}
              sub={status?.uptime_seconds != null ? `运行 ${formatUptime(status.uptime_seconds)}` : undefined}
              divider
            />
            <InfoRow
              label="开机自启"
              value={status?.launchagent_loaded ? '已启用' : '未启用'}
              valueColor={status?.launchagent_loaded ? '#34C759' : '#FF3B30'}
              divider
            />
            <InfoRow
              label="安装状态"
              value={status?.installed ? '已安装' : '未安装'}
              valueColor={status?.installed ? '#34C759' : '#FF3B30'}
              divider
            />
          </Card>
        </div>

        {/* ── Right Column: Log Panel ── */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {/* Log header */}
          <div style={{
            padding: '12px 16px 0',
            borderBottom: '0.5px solid rgba(60,60,67,0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>运行日志</span>
              <span style={{ fontSize: 12, color: '#AEAEB2' }}>{filteredLogs.length} 条</span>
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 0 }}>
              {([
                { key: 'all', label: '全部', count: logs.length },
                { key: 'error', label: '异常', count: errorCount },
                { key: 'telegram', label: 'Telegram', count: telegramCount },
                { key: 'tools', label: '工具/内存', count: toolsCount },
              ] as const).map(({ key, label, count }) => (
                <TabBtn
                  key={key}
                  active={logFilter === key}
                  onClick={() => setLogFilter(key)}
                  warn={key === 'error' && errorCount > 0}
                >
                  {label}
                  {count > 0 && (
                    <span style={{
                      marginLeft: 4,
                      fontSize: 11,
                      padding: '0 5px',
                      borderRadius: 10,
                      background: logFilter === key
                        ? (key === 'error' && errorCount > 0 ? '#FF3B30' : '#007AFF')
                        : 'rgba(60,60,67,0.1)',
                      color: logFilter === key ? '#fff' : '#636366',
                      fontWeight: 500,
                      lineHeight: '16px',
                      display: 'inline-block',
                    }}>
                      {count}
                    </span>
                  )}
                </TabBtn>
              ))}
            </div>
          </div>

          {/* Telegram notice */}
          {logFilter === 'telegram' && telegramCount > 0 && (
            <div style={{
              padding: '8px 16px',
              background: 'rgba(0,122,255,0.06)',
              borderBottom: '0.5px solid rgba(60,60,67,0.1)',
              fontSize: 11,
              color: '#636366',
              lineHeight: 1.5,
            }}>
              这些是 Telegram Bot API 网络连接失败的记录，在中国大陆属于正常现象（API 服务器被屏蔽）。如不使用 Telegram 功能，可在配置中关闭。
            </div>
          )}

          {/* Log lines */}
          <div style={{
            height: 380,
            overflowY: 'auto',
            padding: '10px 0',
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
            fontSize: 11,
            lineHeight: 1.7,
          }}>
            {filteredLogs.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#AEAEB2' }}>
                {logFilter === 'error' ? '无异常记录，运行正常 ✓' : '暂无日志'}
              </div>
            ) : (
              filteredLogs.map((entry, i) => {
                const tag = getLogTag(entry.line)
                const color =
                  tag === 'fatal' ? '#FF3B30'
                  : tag === 'telegram' ? '#AEAEB2'
                  : tag === 'tools' ? '#FF9500'
                  : '#3C3C43'
                return (
                  <div
                    key={i}
                    style={{
                      padding: '0 16px',
                      color,
                      wordBreak: 'break-all',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {entry.line}
                  </div>
                )
              })
            )}
          </div>
        </Card>

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
      padding: 16,
      ...style,
    }}>
      {children}
    </div>
  )
}

function StatusDot({ running, pulse }: { running: boolean; pulse?: boolean }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10 }}>
      {pulse && running && (
        <span style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          background: '#34C759',
          opacity: 0.4,
          animation: 'oc-pulse 1.5s ease-in-out infinite',
        }} />
      )}
      <span style={{
        position: 'relative',
        width: 10, height: 10,
        borderRadius: '50%',
        background: running ? '#34C759' : '#FF3B30',
        display: 'block',
      }} />
      <style>{`
        @keyframes oc-pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </span>
  )
}

function CtrlBtn({ label, color, disabled, onClick }: {
  label: string
  color: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 14px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        background: disabled ? 'rgba(60,60,67,0.08)' : `${color}20`,
        color: disabled ? '#AEAEB2' : color,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

function InfoRow({ label, value, sub, mono, valueColor, divider }: {
  label: string
  value: string
  sub?: string
  mono?: boolean
  valueColor?: string
  divider?: boolean
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '11px 16px',
      borderTop: divider ? '0.5px solid rgba(60,60,67,0.12)' : undefined,
    }}>
      <span style={{ fontSize: 14, color: '#000', fontWeight: 400 }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{
          fontSize: 14,
          color: valueColor ?? '#636366',
          fontFamily: mono ? 'ui-monospace, monospace' : undefined,
          fontWeight: valueColor ? 500 : 400,
        }}>
          {value}
        </span>
        {sub && (
          <div style={{ fontSize: 11, color: '#AEAEB2', marginTop: 1 }}>{sub}</div>
        )}
      </div>
    </div>
  )
}

function NavBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: '#007AFF',
        fontSize: 13,
        fontWeight: 400,
        cursor: 'pointer',
        padding: '4px 10px',
        borderRadius: 6,
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,122,255,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      {children}
    </button>
  )
}

function TabBtn({ children, active, onClick, warn }: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  warn?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 10px',
        borderRadius: '8px 8px 0 0',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        background: active ? '#fff' : 'transparent',
        color: active ? (warn ? '#FF3B30' : '#007AFF') : '#636366',
        border: 'none',
        borderBottom: active ? '2px solid ' + (warn ? '#FF3B30' : '#007AFF') : '2px solid transparent',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        marginBottom: -0.5,
        transition: 'color 0.1s',
      }}
    >
      {children}
    </button>
  )
}
