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

function toneIcon(tone: CardTone) {
  if (tone === 'success') return '✅'
  if (tone === 'warning') return '⚠️'
  if (tone === 'error') return '❌'
  return '⟳'
}

function formatDiskMb(mb: number) {
  if (!Number.isFinite(mb) || mb <= 0) return '未知'
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`
}

function formatTime(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function InfoCard({
  title,
  tone,
  value,
  sub,
  loading,
}: {
  title: string
  tone: CardTone
  value: string
  sub?: string
  loading?: boolean
}) {
  return (
    <div
      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
      style={{
        background: 'var(--bg-card, #faf7f2)',
        border: '1px solid var(--border, #d4c5b5)',
        borderRadius: 12,
        padding: 16,
        minHeight: 92,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
          {title}
        </div>
        <div aria-hidden="true">{loading ? toneIcon('loading') : toneIcon(tone)}</div>
      </div>

      {loading ? (
        <div className="mt-3">
          <div
            className="h-4 w-3/4 rounded-md bg-black/10"
            style={{ height: 16, width: '75%', borderRadius: 6, background: 'rgba(0,0,0,0.08)' }}
          />
          <div
            className="mt-2 h-3 w-1/2 rounded-md bg-black/10"
            style={{ marginTop: 8, height: 12, width: '50%', borderRadius: 6, background: 'rgba(0,0,0,0.06)' }}
          />
        </div>
      ) : (
        <>
          <div className="mt-3 text-lg font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
            {value}
          </div>
          {sub ? (
            <div className="mt-1 text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
              {sub}
            </div>
          ) : null}
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

  const windowsInfo = systemInfo as unknown as { wsl_state?: string | null; windows_admin?: boolean } | null
  const wslState = windowsInfo?.wsl_state ?? null
  const isWindows = wslState !== null
  const windowsAdmin = Boolean(windowsInfo?.windows_admin)

  const refresh = useCallback(async () => {
    setLoading(true)
    setHint(null)

    if (!isTauriRuntime()) {
      setSystemInfo(MOCK_SYSTEM_INFO)
      setHint('浏览器预览模式：未连接到 Tauri，显示模拟数据')
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
      setHint(e instanceof Error ? `获取系统信息失败：${e.message}` : '获取系统信息失败')
      setLastUpdated(Date.now())
    } finally {
      setLoading(false)
    }
  }, [setSystemInfo])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh()
    }, 30_000)
    return () => window.clearInterval(id)
  }, [refresh])

  const cards = useMemo(() => {
    const info = systemInfo
    const isLoading = loading && !info

    const openclawTone: CardTone = !info || isLoading ? 'loading' : info.openclaw_installed ? 'success' : 'error'
    const gatewayTone: CardTone =
      !info || isLoading ? 'loading' : info.openclaw_installed ? (info.gateway_running ? 'success' : 'error') : 'error'

    const cards = [
      {
        title: 'macOS',
        tone: (!info || isLoading ? 'loading' : 'success') as CardTone,
        value: info ? info.os_name : '—',
        sub: info ? info.arch : undefined,
      },
      {
        title: 'Node.js',
        tone: (!info || isLoading ? 'loading' : info.node_version ? 'success' : 'error') as CardTone,
        value: info?.node_version ?? '未检测到',
        sub: undefined,
      },
      {
        title: 'npm',
        tone: (!info || isLoading ? 'loading' : info.npm_version ? 'success' : 'error') as CardTone,
        value: info?.npm_version ?? '未检测到',
        sub: undefined,
      },
      {
        title: 'OpenClaw',
        tone: openclawTone,
        value: !info ? '—' : info.openclaw_installed ? '已安装' : '未安装',
        sub: info?.openclaw_version ? `版本：${info.openclaw_version}` : undefined,
      },
      {
        title: 'Gateway',
        tone: gatewayTone,
        value: !info ? '—' : !info.openclaw_installed ? '未安装' : info.gateway_running ? '运行中' : '未运行',
        sub: info?.gateway_running ? `端口：${info.gateway_port}` : undefined,
      },
    ]

    // 磁盘空间卡片（追加到现有卡片数组末尾）
    // 阈值：< 2048 MB (2 GB) 警告，< 512 MB 阻止安装
    const diskFreeMb = info?.disk_free_mb ?? null

    if (diskFreeMb !== null) {
      const diskTone: CardTone = diskFreeMb < 512 ? 'error' : diskFreeMb < 2048 ? 'warning' : 'success'

      const diskText = formatDiskMb(diskFreeMb)

      const diskSub =
        diskFreeMb < 512
          ? '磁盘空间严重不足，安装将失败，请先清理磁盘'
          : diskFreeMb < 2048
            ? '磁盘空间较少，建议先清理后再安装'
            : '空间充裕'

      cards.push({
        title: '磁盘剩余空间',
        tone: diskTone,
        value: diskText,
        sub: diskSub,
      })
    }

    return cards
  }, [systemInfo, loading])

  const installed = systemInfo?.openclaw_installed ?? false
  const gatewayRunning = systemInfo?.gateway_running ?? false
  const diskTooLow = systemInfo?.disk_free_mb !== undefined && systemInfo.disk_free_mb < 512

  const primaryAction = useMemo(() => {
    if (!installed) {
      return { label: '一键安装', onClick: () => navigate('/installing') as void, disabled: diskTooLow }
    }
    if (installed && !gatewayRunning) {
      return { label: '启动 Gateway（M2 实现）', onClick: () => {}, disabled: true }
    }
    return { label: '进入管理', onClick: () => navigate('/dashboard') as void, disabled: false }
  }, [installed, gatewayRunning, navigate, diskTooLow])

  const secondaryAction = useMemo(() => {
    if (installed && gatewayRunning) return null
    if (!installed) {
      return { label: '进入管理', onClick: () => navigate('/dashboard') as void, disabled: true }
    }
    return { label: '进入管理', onClick: () => navigate('/dashboard') as void, disabled: false }
  }, [installed, gatewayRunning, navigate])

  return (
    <div className="min-h-screen bg-[var(--bg)]" style={{ background: 'var(--bg, #f3efe7)' }}>
      <div
        className="flex items-center justify-between px-6 py-3 text-white"
        style={{ background: 'var(--accent, #c94b1d)' }}
      >
        <div className="text-base font-semibold">🦞 OpenClaw 安装器</div>
        <div className="text-sm opacity-90">v0.1</div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
            环境检测
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)]"
            style={{
              border: '1px solid var(--border, #d4c5b5)',
              color: 'var(--text-secondary, #6b4c3b)',
              background: 'transparent',
            }}
          >
            重新检测
          </button>
        </div>

        <div
          className="mt-4 grid grid-cols-2 gap-4"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}
        >
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

        <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4" style={{ background: 'var(--bg-card, #faf7f2)', border: '1px solid var(--border, #d4c5b5)', borderRadius: 12, padding: 16 }}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
              className="rounded-lg px-6 py-2 text-white disabled:opacity-50"
              style={{
                background: 'var(--accent, #c94b1d)',
                opacity: primaryAction.disabled ? 0.5 : 1,
                cursor: primaryAction.disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {primaryAction.label}
            </button>

            {secondaryAction ? (
              <button
                type="button"
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.onClick}
                className="rounded-lg border border-[var(--border)] px-6 py-2 text-[var(--text-secondary)] disabled:opacity-50"
                style={{
                  border: '1px solid var(--border, #d4c5b5)',
                  color: 'var(--text-secondary, #6b4c3b)',
                  background: 'transparent',
                  opacity: secondaryAction.disabled ? 0.5 : 1,
                  cursor: secondaryAction.disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {secondaryAction.label}
              </button>
            ) : null}
          </div>

          {!installed && diskTooLow ? (
            <p className="text-sm mt-2" style={{ color: 'var(--error, #dc2626)' }}>
              磁盘剩余空间不足 512 MB，请先清理磁盘再安装。
            </p>
          ) : null}

          <div className="mt-3 text-sm text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
            <div>
              {loading ? '⟳ 正在检测...' : hint ? `⚠️ ${hint}` : lastUpdated ? `✅ 已更新：${formatTime(lastUpdated)}` : '—'}
            </div>
            {!loading && isWindows ? (
              <div className="mt-1 text-xs opacity-90">
                WSL：{String(wslState)}；管理员权限：{windowsAdmin ? '是' : '否'}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
