import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
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

const MOCK_LOGS: LogEntry[] = Array.from({ length: 10 }, (_, i) => ({
  line: `[INFO] Gateway 运行正常 (模拟日志 #${i + 1})`,
}))

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDateTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<GatewayDetailedStatus | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

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
    setActionMsg('')
    try {
      await invoke(action)
      setActionMsg(action === 'start_gateway' ? '启动成功' : action === 'stop_gateway' ? '已停止' : '重启成功')
      await fetchStatus()
    } catch (e) {
      setActionMsg(`操作失败: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  const gatewayStatus = !status ? 'unknown' : status.gateway_running ? 'running' : 'stopped'
  const gatewayAddress = status ? `${GATEWAY_HOST}:${status.gateway_port}` : '—'
  const startedAt =
    status?.uptime_seconds == null ? '—' : formatDateTime(Date.now() - status.uptime_seconds * 1000)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">OpenClaw 控制台</h1>
          {status?.version && (
            <p className="text-sm text-gray-400 mt-0.5">版本 {status.version}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/repair')}
            className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            诊断修复
          </button>
          <button
            onClick={() => navigate('/config-wizard')}
            className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            修改配置
          </button>
          <button
            onClick={fetchStatus}
            className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            刷新
          </button>
          <button
            type="button"
            onClick={() => navigate('/update')}
            className="rounded-lg border px-5 py-2 text-sm"
            style={{
              border: '1px solid var(--border, #d4c5b5)',
              color: 'var(--text-secondary, #6b4c3b)',
              background: 'transparent',
            }}
          >
            检查更新
          </button>
        </div>
      </div>

      {/* 主状态卡片 */}
      <div className="bg-gray-900 rounded-xl p-5 mb-4 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <StatusBadge status={gatewayStatus} />
            <span className="text-lg font-semibold">Gateway</span>
          </div>
          {status?.gateway_pid && (
            <span className="text-xs text-gray-500">PID {status.gateway_pid}</span>
          )}
        </div>

        {/* 控制按钮 */}
        <div className="flex gap-2">
          <button
            onClick={() => handleAction('start_gateway')}
            disabled={loading || !status || status.gateway_running}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            启动
          </button>
          <button
            onClick={() => handleAction('stop_gateway')}
            disabled={loading || !status || !status.gateway_running}
            className="px-4 py-2 bg-red-800 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            停止
          </button>
          <button
            onClick={() => handleAction('restart_gateway')}
            disabled={loading || !status}
            className="px-4 py-2 bg-orange-700 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            重启
          </button>
        </div>

        {actionMsg && (
          <p className="mt-2 text-sm text-orange-300">{actionMsg}</p>
        )}
      </div>

      {/* 详细信息网格 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <InfoCard label="Gateway 地址" value={gatewayAddress} />
        <InfoCard label="启动时间" value={startedAt} sub={`运行时长：${formatUptime(status?.uptime_seconds ?? null)}`} />
        <InfoCard
          label="LaunchAgent"
          value={status?.launchagent_loaded ? '已加载' : '未加载'}
          valueColor={status?.launchagent_loaded ? 'text-green-400' : 'text-red-400'}
        />
        <InfoCard
          label="安装状态"
          value={status?.installed ? '已安装' : '未安装'}
          valueColor={status?.installed ? 'text-green-400' : 'text-red-400'}
        />
      </div>

      {/* 日志面板 */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
          <span className="text-sm font-medium text-gray-300">错误日志（最近 50 行）</span>
          <span className="text-xs text-gray-500">{logs.length} 行</span>
        </div>
        <div
          className="h-48 overflow-y-auto p-3 font-mono text-xs text-green-400 space-y-0.5"
          style={{ background: '#0f0f0f' }}
        >
          {logs.length === 0 ? (
            <p className="text-gray-600">暂无日志</p>
          ) : (
            logs.map((entry, i) => (
              <div key={i} className="leading-5 whitespace-pre-wrap break-all">
                {entry.line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function InfoCard({
  label,
  value,
  sub,
  valueColor = 'text-white',
}: {
  label: string
  value: string
  sub?: string
  valueColor?: string
}) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-base font-semibold ${valueColor}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-gray-500">{sub}</p> : null}
    </div>
  )
}
