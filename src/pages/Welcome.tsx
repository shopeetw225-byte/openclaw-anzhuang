import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import { useInstallStore } from '../stores/installStore'
import type { SystemInfo } from '../stores/installStore'

function isTauriRuntime() {
  return (
    typeof window !== 'undefined' &&
    (Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__))
  )
}

const MOCK_SYSTEM_INFO: SystemInfo & { distro_id: string | null; systemd_available: boolean } = {
  os_name: 'macOS（模拟）',
  arch: 'arm64',
  node_version: 'v22.x',
  npm_version: '10.x',
  openclaw_version: null,
  openclaw_installed: false,
  gateway_running: false,
  gateway_port: 18789,
  homebrew_available: true,
  disk_free_mb: 50_000,
  distro_id: null,
  systemd_available: false,
}

type CardTone = 'success' | 'warning' | 'error' | 'loading'

function formatDiskMb(mb: number) {
  if (!Number.isFinite(mb) || mb <= 0) return '未知'
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`
}

function formatTime(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const TONE_COLOR: Record<CardTone, string> = {
  success: '#34C759',
  warning: '#FF9500',
  error:   '#FF3B30',
  loading: '#AEAEB2',
}

const TONE_ICON: Record<CardTone, string> = {
  success: '✓',
  warning: '!',
  error:   '✗',
  loading: '…',
}

function InfoCard({ title, tone, value, sub, loading }: {
  title: string
  tone: CardTone
  value: string
  sub?: string
  loading?: boolean
}) {
  const color = TONE_COLOR[tone]

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: '14px 16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      minHeight: 82,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#636366' }}>{title}</span>
        <span style={{
          width: 20, height: 20,
          borderRadius: '50%',
          background: loading ? 'rgba(60,60,67,0.1)' : `${color}20`,
          color: loading ? '#AEAEB2' : color,
          fontSize: 11,
          fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {TONE_ICON[loading ? 'loading' : tone]}
        </span>
      </div>

      {loading ? (
        <div>
          <div style={{ height: 14, width: '70%', borderRadius: 6, background: 'rgba(0,0,0,0.06)' }} />
          <div style={{ height: 11, width: '45%', borderRadius: 6, background: 'rgba(0,0,0,0.04)', marginTop: 6 }} />
        </div>
      ) : (
        <>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#000', letterSpacing: -0.3 }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: '#AEAEB2', marginTop: 3 }}>{sub}</div>}
        </>
      )}
    </div>
  )
}

export default function Welcome() {
  const navigate = useNavigate()
  const systemInfo = useInstallStore((s) => s.systemInfo)
  const setSystemInfo = useInstallStore((s) => s.setSystemInfo)
  const [loading, setLoading] = useState(true)
  const [hint, setHint] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const windowsInfo = systemInfo as unknown as {
    wsl_state?: string | null
    wsl_default_distro?: string | null
    wsl_has_ubuntu?: boolean
    windows_admin?: boolean
  } | null
  const wslState = windowsInfo?.wsl_state ?? null
  const wslDefaultDistro = windowsInfo?.wsl_default_distro ?? null
  const wslHasUbuntu = Boolean(windowsInfo?.wsl_has_ubuntu)
  const isWindows = wslState !== null
  const windowsAdmin = Boolean(windowsInfo?.windows_admin)

  // Windows 用户需要管理员权限来安装 WSL/Node/服务
  const needsAdminPrivileges = isWindows && !windowsAdmin

  const refresh = useCallback(async () => {
    setLoading(true)
    setHint(null)

    if (!isTauriRuntime()) {
      setSystemInfo(MOCK_SYSTEM_INFO)
      setHint('浏览器预览模式')
      setLastUpdated(Date.now())
      setLoading(false)
      return
    }

    try {
      const info = await invoke<SystemInfo>('get_system_info')
      setSystemInfo(info)
      setLastUpdated(Date.now())
    } catch (e) {
      setSystemInfo(MOCK_SYSTEM_INFO)
      setHint(e instanceof Error ? e.message : '获取系统信息失败')
      setLastUpdated(Date.now())
    } finally {
      setLoading(false)
    }
  }, [setSystemInfo])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const id = window.setInterval(() => void refresh(), 30_000)
    return () => window.clearInterval(id)
  }, [refresh])

  const startGateway = useCallback(async () => {
    if (!isTauriRuntime()) {
      setHint('浏览器预览模式无法启动 Gateway')
      return
    }
    setHint(null)
    try {
      await invoke('start_gateway')
      await refresh()
    } catch (e) {
      setHint(e instanceof Error ? e.message : '启动 Gateway 失败')
    }
  }, [refresh])

  const cards = useMemo(() => {
    const info = systemInfo
    const isLoading = loading && !info

    const distroId = (info as unknown as { distro_id?: string | null })?.distro_id ?? null
    const osTitle = isWindows ? 'Windows' : distroId !== null ? 'Linux' : 'macOS'

    const openclawTone: CardTone = !info || isLoading ? 'loading' : info.openclaw_installed ? 'success' : 'error'
    const gatewayTone: CardTone =
      !info || isLoading ? 'loading' : info.openclaw_installed ? (info.gateway_running ? 'success' : 'error') : 'error'

    const cards = [
      {
        title: osTitle,
        tone: (!info || isLoading ? 'loading' : 'success') as CardTone,
        value: info ? info.os_name : '—',
        sub: info ? info.arch : undefined,
      },
      {
        title: 'Node.js',
        tone: (!info || isLoading ? 'loading' : info.node_version ? 'success' : 'error') as CardTone,
        value: info?.node_version ?? '未检测到',
      },
      {
        title: 'npm',
        tone: (!info || isLoading ? 'loading' : info.npm_version ? 'success' : 'error') as CardTone,
        value: info?.npm_version ?? '未检测到',
      },
      {
        title: 'OpenClaw',
        tone: openclawTone,
        value: !info ? '—' : info.openclaw_installed ? '已安装' : '未安装',
        sub: info?.openclaw_version ? `版本 ${info.openclaw_version}` : undefined,
      },
      {
        title: 'Gateway',
        tone: gatewayTone,
        value: !info ? '—' : !info.openclaw_installed ? '未安装' : info.gateway_running ? '运行中' : '未运行',
        sub: info?.gateway_running ? `端口 ${info.gateway_port}` : undefined,
      },
    ]

    const diskFreeMb = info?.disk_free_mb ?? null
    if (diskFreeMb !== null) {
      const diskTone: CardTone = diskFreeMb < 512 ? 'error' : diskFreeMb < 2048 ? 'warning' : 'success'
      cards.push({
        title: '磁盘剩余',
        tone: diskTone,
        value: formatDiskMb(diskFreeMb),
        sub: diskFreeMb < 512 ? '空间严重不足' : diskFreeMb < 2048 ? '建议先清理' : '空间充裕',
      })
    }

    return cards
  }, [systemInfo, loading])

  const installed = systemInfo?.openclaw_installed ?? false
  const gatewayRunning = systemInfo?.gateway_running ?? false
  const diskTooLow = systemInfo?.disk_free_mb !== undefined && systemInfo.disk_free_mb < 512

  const primaryAction = useMemo(() => {
    if (!installed) {
      return {
        label: '一键安装',
        onClick: () => navigate('/installing') as void,
        disabled: diskTooLow || needsAdminPrivileges,
      }
    }
    if (installed && !gatewayRunning) return { label: '启动 Gateway', onClick: () => void startGateway(), disabled: false }
    return { label: '进入控制台', onClick: () => navigate('/dashboard') as void, disabled: false }
  }, [installed, gatewayRunning, navigate, diskTooLow, needsAdminPrivileges, startGateway])

  const secondaryAction = useMemo(() => {
    if (installed && gatewayRunning) return null
    if (!installed) return { label: '进入控制台', onClick: () => navigate('/dashboard') as void, disabled: true }
    return { label: '进入控制台', onClick: () => navigate('/dashboard') as void, disabled: false }
  }, [installed, gatewayRunning, navigate])

  return (
    <div style={{ minHeight: '100vh', background: '#F2F2F7' }}>

      {/* Header */}
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
        <span style={{ fontSize: 17, fontWeight: 600, color: '#000', letterSpacing: -0.3 }}>
          OpenClaw 安装器
        </span>
        <button
          onClick={() => void refresh()}
          style={{
            background: 'none', border: 'none',
            color: '#007AFF', fontSize: 13, cursor: 'pointer',
            padding: '4px 8px', borderRadius: 6,
          }}
        >
          重新检测
        </button>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 20px' }}>

        {/* Section title */}
        <div style={{ fontSize: 13, fontWeight: 600, color: '#636366', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          环境检测
        </div>

        {/* Cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
          {cards.map((c) => (
            <InfoCard
              key={c.title}
              title={c.title}
              tone={c.tone}
              value={c.value}
              sub={c.sub}
              loading={loading && !systemInfo}
            />
          ))}
        </div>

        {/* Action card */}
        <div style={{
          background: '#fff',
          borderRadius: 12,
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
              style={{
                padding: '10px 24px',
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 600,
                background: primaryAction.disabled ? '#AEAEB2' : '#007AFF',
                color: '#fff',
                border: 'none',
                cursor: primaryAction.disabled ? 'not-allowed' : 'pointer',
                letterSpacing: -0.2,
              }}
            >
              {primaryAction.label}
            </button>

            {secondaryAction && (
              <button
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.onClick}
                style={{
                  padding: '10px 24px',
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 500,
                  background: 'rgba(0,122,255,0.08)',
                  color: secondaryAction.disabled ? '#AEAEB2' : '#007AFF',
                  border: 'none',
                  cursor: secondaryAction.disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {secondaryAction.label}
              </button>
            )}
          </div>

          {!installed && diskTooLow && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: '#FF3B30' }}>
              磁盘剩余空间不足 512 MB，请先清理磁盘再安装。
            </p>
          )}

          {needsAdminPrivileges && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: '#FF9500' }}>
              ⚠️ Windows 安装需要管理员权限。请右键点击本安装器，选择"以管理员身份运行"。
            </p>
          )}

          <div style={{ marginTop: 12, fontSize: 12, color: '#AEAEB2' }}>
            {loading ? '正在检测...' : hint ? `⚠ ${hint}` : lastUpdated ? `已更新 ${formatTime(lastUpdated)}` : '—'}
            {!loading && isWindows && (
              <span style={{ marginLeft: 10 }}>
                WSL：{String(wslState)}
                {wslDefaultDistro ? `（默认：${wslDefaultDistro}）` : ''}
                · Ubuntu：{wslHasUbuntu ? '是' : '否'} · 管理员：{windowsAdmin ? '是' : '否'}
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
