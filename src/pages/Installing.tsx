import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import LogPanel from '../components/LogPanel'
import { useInstallLog } from '../hooks/useInstallLog'
import { useInstallStore } from '../stores/installStore'
import type { SystemInfo } from '../stores/installStore'

function isTauriRuntime() {
  return (
    typeof window !== 'undefined' &&
    (Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__))
  )
}

/** 将 Rust 技术性错误信息转换为用户友好的中文提示 */
function friendlyError(raw: string): string {
  const msg = raw.toLowerCase()

  // 网络错误
  if (
    msg.includes('network') ||
    msg.includes('connection refused') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('dns') ||
    msg.includes('无法连接') ||
    msg.includes('network error')
  ) {
    return `网络连接失败：请检查网络后重试。\n（技术细节：${raw}）`
  }

  // 权限错误
  if (
    msg.includes('permission denied') ||
    msg.includes('access is denied') ||
    msg.includes('operation not permitted') ||
    msg.includes('权限不足') ||
    msg.includes('eacces') ||
    msg.includes('eperm')
  ) {
    return `权限不足：请以管理员身份运行，或检查安装目录权限。\n（技术细节：${raw}）`
  }

  // 磁盘空间
  if (msg.includes('no space left') || msg.includes('disk full') || msg.includes('enospc')) {
    return `磁盘空间不足：请清理磁盘后重试（至少需要 2 GB 剩余空间）。\n（技术细节：${raw}）`
  }

  // WSL 未安装
  if (msg.includes('wsl') && (msg.includes('not found') || msg.includes('未检测到'))) {
    return 'WSL 未安装或不可用。\n解决方案：\n1. 以管理员身份运行本安装器\n2. 或手动执行：powershell -Command "wsl --install -d Ubuntu"\n3. 或在 Microsoft Store 搜索 Ubuntu 并安装'
  }

  // npm 失败
  if (msg.includes('npm') && (msg.includes('failed') || msg.includes('error'))) {
    return `npm 安装失败：请检查网络连接和 npm 配置。\n（技术细节：${raw}）`
  }

  // 脚本未找到
  if (msg.includes('no such file') || msg.includes('找不到') || msg.includes('enoent')) {
    return `安装脚本未找到：请重新下载安装器。\n（技术细节：${raw}）`
  }

  // 默认：保留原始信息
  return raw || '安装失败，请查看日志获取详情。'
}

export default function Installing() {
  const navigate = useNavigate()
  const logs = useInstallStore((s) => s.logs)
  const installProgress = useInstallStore((s) => s.installProgress)
  const currentStep = useInstallStore((s) => s.currentStep)
  const clearLogs = useInstallStore((s) => s.clearLogs)

  const [plan, setPlan] = useState<string[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [finalDone, setFinalDone] = useState(false)

  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)

  const planRef = useRef<string[]>([])
  const currentIndexRef = useRef(0)
  const runIdRef = useRef(0)
  const cancelRequestedRef = useRef(false)

  useInstallLog()

  const startInstall = useCallback(async (opts?: { resume?: boolean }) => {
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    cancelRequestedRef.current = false

    setCancelled(false)
    setError(null)
    setFinalDone(false)
    clearLogs()
    useInstallStore.getState().setProgress(0)
    useInstallStore.getState().setCurrentStep('')

    if (!isTauriRuntime()) {
      setRunning(false)
      setError('未连接到 Tauri，无法执行安装（浏览器预览模式）')
      return
    }

    setRunning(true)
    try {
      let info = useInstallStore.getState().systemInfo
      if (!info) {
        info = await invoke<SystemInfo>('get_system_info')
        useInstallStore.getState().setSystemInfo(info)
      }

      const buildInitialPlan = (systemInfo: SystemInfo): string[] | { error: string } => {
        const distroId = (systemInfo as unknown as { distro_id?: string | null }).distro_id ?? null
        if (distroId !== null) {
          return ['install-linux.sh']
        }

        const wslState = (systemInfo as unknown as { wsl_state?: string | null }).wsl_state ?? null
        const wslHasUbuntu = (systemInfo as unknown as { wsl_has_ubuntu?: boolean }).wsl_has_ubuntu ?? false
        if (wslState === null) {
          return ['install-macos.sh']
        }

        // WSL 已可用
        if (wslState === 'available') {
          if (wslHasUbuntu) {
            // WSL + Ubuntu 都有，直接在 WSL 中安装
            return ['install-linux.sh']
          }
          // WSL 存在但没有 Ubuntu，安装 Ubuntu 到已有 WSL
          return ['windows/install-ubuntu.ps1']
        }

        // WSL 未安装但支持
        if (wslState === 'needs_install') {
          return ['windows/install-wsl.ps1']
        }

        // 系统不支持 WSL2（比如家庭版 Win10），改用原生 PowerShell 路径
        if (wslState === 'unsupported') {
          return [
            'windows/install-node-windows.ps1',
            'windows/install-openclaw.ps1',
            'windows/install-nssm.ps1',
            'windows/register-service-nssm.ps1',
          ]
        }

        // 无法确定 WSL 状态，尝试原生 Windows 路径
        if (wslState === 'unknown') {
          return [
            'windows/install-node-windows.ps1',
            'windows/install-openclaw.ps1',
            'windows/install-nssm.ps1',
            'windows/register-service-nssm.ps1',
          ]
        }

        return { error: `未知 WSL 状态：${String(wslState)}` }
      }

      const initialPlanResult = buildInitialPlan(info)
      if (!Array.isArray(initialPlanResult)) {
        setError(initialPlanResult.error)
        return
      }

      let currentPlan = opts?.resume ? planRef.current : initialPlanResult
      if (currentPlan.length === 0) {
        currentPlan = initialPlanResult
      }

      const resumeIndex = currentIndexRef.current
      let index = opts?.resume ? resumeIndex : 0
      if (index < 0 || index >= currentPlan.length) {
        index = 0
      }

      planRef.current = currentPlan
      setPlan(currentPlan)
      currentIndexRef.current = index
      setCurrentIndex(index)

      for (let i = index; i < currentPlan.length; i += 1) {
        if (runIdRef.current !== runId) return
        if (cancelRequestedRef.current) return

        currentIndexRef.current = i
        setCurrentIndex(i)

        const scriptName = currentPlan[i]
        await invoke<void>('run_install', { scriptName })

        if (runIdRef.current !== runId) return
        if (cancelRequestedRef.current) return

        // 处理 WSL 安装后的状态刷新
        if (scriptName === 'windows/install-wsl.ps1') {
          const refreshed = await invoke<SystemInfo>('get_system_info')
          useInstallStore.getState().setSystemInfo(refreshed)

          if (runIdRef.current !== runId) return
          if (cancelRequestedRef.current) return

          const refreshedWslState = (refreshed as unknown as { wsl_state?: string | null }).wsl_state ?? null
          const refreshedHasUbuntu = (refreshed as unknown as { wsl_has_ubuntu?: boolean }).wsl_has_ubuntu ?? false
          if (refreshedWslState === 'available' && refreshedHasUbuntu) {
            if (!currentPlan.includes('install-linux.sh')) {
              currentPlan = [...currentPlan, 'install-linux.sh']
              planRef.current = currentPlan
              setPlan(currentPlan)
            }
            continue
          }

          if (refreshedWslState === 'available' && !refreshedHasUbuntu) {
            setError('已检测到 WSL，但未检测到 Ubuntu 发行版。\n解决方案：\n1. 手动在 Microsoft Store 搜索"Ubuntu"并安装\n2. 或以管理员身份运行：powershell -Command "wsl --install -d Ubuntu"\n3. 安装完成后，点击"重试"继续安装')
            return
          }

          setError('✓ WSL 安装完成，需要重启电脑才能继续。\n请重启后重新打开安装器，点击"重试"从断点继续安装。')
          return
        }

        // 处理 Ubuntu 安装后的状态刷新
        if (scriptName === 'windows/install-ubuntu.ps1') {
          const refreshed = await invoke<SystemInfo>('get_system_info')
          useInstallStore.getState().setSystemInfo(refreshed)

          if (runIdRef.current !== runId) return
          if (cancelRequestedRef.current) return

          const refreshedHasUbuntu = (refreshed as unknown as { wsl_has_ubuntu?: boolean }).wsl_has_ubuntu ?? false
          if (refreshedHasUbuntu) {
            if (!currentPlan.includes('install-linux.sh')) {
              currentPlan = [...currentPlan, 'install-linux.sh']
              planRef.current = currentPlan
              setPlan(currentPlan)
            }
            continue
          }

          setError('Ubuntu 发行版安装可能需要重启。\n请重启电脑后打开安装器，点击"重试"继续。\n或手动在 Microsoft Store 安装 Ubuntu。')
          return
        }
      }

      if (runIdRef.current !== runId) return
      if (cancelRequestedRef.current) return

      setFinalDone(true)
      useInstallStore.getState().setProgress(100)
      useInstallStore.getState().setCurrentStep('Done')
    } catch (e) {
      if (runIdRef.current === runId) {
        const raw = e instanceof Error ? e.message : String(e)
        setError(friendlyError(raw))
      }
    } finally {
      if (runIdRef.current === runId) {
        setRunning(false)
      }
    }
  }, [clearLogs])

  useEffect(() => {
    void startInstall()
  }, [startInstall])

  useEffect(() => {
    if (cancelled) return
    if (!finalDone) return

    const id = window.setTimeout(() => {
      navigate('/config-wizard', { replace: true })
    }, 2000)
    return () => window.clearTimeout(id)
  }, [finalDone, cancelled, navigate])

  const progress = Math.min(Math.max(installProgress, 0), 100)
  const planHint = running && plan.length > 0 ? `（${Math.min(currentIndex + 1, plan.length)}/${plan.length}）` : ''
  const stepText = currentStep ? `正在执行：${currentStep}${planHint}` : running ? `正在准备安装...${planHint}` : '等待开始...'

  const statusText = useMemo(() => {
    if (cancelled) return '已取消显示安装进度（安装可能仍在后台继续）'
    if (error) return `安装出错：${error}`
    if (finalDone) return '安装完成，即将进入配置向导...'
    if (running) return '安装进行中...'
    return '等待开始...'
  }, [cancelled, error, finalDone, running])

  return (
    <div className="min-h-screen bg-[var(--bg)]" style={{ background: 'var(--bg, #f3efe7)' }}>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="text-lg font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
          安装进度
        </div>

        <div
          className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
          style={{
            background: 'var(--bg-card, #faf7f2)',
            border: '1px solid var(--border, #d4c5b5)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
              {stepText}
            </div>
            <div className="text-sm font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
              {progress}%
            </div>
          </div>

          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-black/10" style={{ background: 'rgba(0,0,0,0.08)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: progress >= 100 ? 'var(--success, #2d7a4f)' : 'var(--accent, #c94b1d)',
                transition: 'width 200ms ease',
              }}
            />
          </div>

          <div className="mt-3 text-sm text-[var(--text-secondary)]" style={{ color: error ? 'var(--error, #dc2626)' : 'var(--text-secondary, #6b4c3b)' }}>
            {statusText}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {running ? (
              <button
                type="button"
                onClick={() => {
                  cancelRequestedRef.current = true
                  setCancelled(true)
                  setRunning(false)
                }}
                className="rounded-lg border border-[var(--border)] px-6 py-2 text-[var(--text-secondary)]"
                style={{
                  border: '1px solid var(--border, #d4c5b5)',
                  color: 'var(--text-secondary, #6b4c3b)',
                  background: 'transparent',
                }}
              >
                取消
              </button>
            ) : null}

            {error || cancelled ? (
              <>
                <button
                  type="button"
                  onClick={() => void startInstall({ resume: true })}
                  className="rounded-lg px-6 py-2 text-white"
                  style={{ background: 'var(--accent, #c94b1d)' }}
                >
                  重试
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/welcome', { replace: true })}
                  className="rounded-lg border border-[var(--border)] px-6 py-2 text-[var(--text-secondary)]"
                  style={{
                    border: '1px solid var(--border, #d4c5b5)',
                    color: 'var(--text-secondary, #6b4c3b)',
                    background: 'transparent',
                  }}
                >
                  返回欢迎页
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <LogPanel logs={logs} />
        </div>
      </div>
    </div>
  )
}
