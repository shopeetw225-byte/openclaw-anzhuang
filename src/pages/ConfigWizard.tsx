import { useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import StepProgress from '../components/StepProgress'

// Temporary IPC types stub. Replace with: import type { SaveConfigPayload } from '../types/ipc'
interface SaveConfigPayload {
  model_primary: string
  api_keys: Record<string, string>
  telegram_enabled: boolean
  telegram_bot_token: string
  telegram_allow_from: number[]
}

function isTauriRuntime() {
  return (
    typeof window !== 'undefined' &&
    (Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__))
  )
}

const MODEL_PRESETS = [
  'moonshot/kimi-k2.5',
  'openai/gpt-4o',
  'anthropic/claude-sonnet-4-5',
  'openrouter/auto',
] as const

const PROVIDER_KEY_MAP: Record<string, string> = {
  moonshot: 'MOONSHOT_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
}

function getProvider(modelPrimary: string) {
  const p = modelPrimary.split('/')[0]?.trim().toLowerCase()
  return p || 'unknown'
}

function maskSecret(value: string) {
  const v = value.trim()
  if (!v) return '未填写'
  const head = v.slice(0, 4)
  return `${head}***`
}

function parseAllowFrom(raw: string) {
  return raw
    .split(/[,\s]+/g)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0)
}

export default function ConfigWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  const [modelPrimary, setModelPrimary] = useState<string>(MODEL_PRESETS[0])
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState(false)

  const [telegramEnabled, setTelegramEnabled] = useState(false)
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramAllowFromRaw, setTelegramAllowFromRaw] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const provider = useMemo(() => getProvider(modelPrimary), [modelPrimary])
  const requiredKeyName = useMemo(() => PROVIDER_KEY_MAP[provider] ?? 'API_KEY', [provider])
  const requiredKeyValue = apiKeys[requiredKeyName] ?? ''

  const wizardSteps = useMemo(() => ['选择模型', '配置密钥', 'Telegram', '确认完成'], [])

  const canGoNext = useMemo(() => {
    if (step === 0) return modelPrimary.trim().length > 0
    if (step === 1) return requiredKeyValue.trim().length > 0
    if (step === 2) {
      if (!telegramEnabled) return true
      return telegramBotToken.trim().length > 0 && parseAllowFrom(telegramAllowFromRaw).length > 0
    }
    return true
  }, [step, modelPrimary, requiredKeyValue, telegramEnabled, telegramBotToken, telegramAllowFromRaw])

  const goNext = () => {
    if (!canGoNext) return
    setError(null)
    setStep((s) => Math.min(s + 1, 3))
  }

  const goBack = () => {
    setError(null)
    setStep((s) => Math.max(s - 1, 0))
  }

  const onFinish = async () => {
    setSaving(true)
    setError(null)

    if (!isTauriRuntime()) {
      setSaving(false)
      setError('未连接到 Tauri，无法保存配置（浏览器预览模式）')
      return
    }

    const allowFrom = telegramEnabled ? parseAllowFrom(telegramAllowFromRaw) : []
    const cleanedApiKeys = Object.fromEntries(
      Object.entries(apiKeys)
        .map(([k, v]) => [k, v.trim()] as const)
        .filter(([, v]) => v.length > 0),
    )

    const payload: SaveConfigPayload = {
      model_primary: modelPrimary.trim(),
      api_keys: cleanedApiKeys,
      telegram_enabled: telegramEnabled,
      telegram_bot_token: telegramEnabled ? telegramBotToken.trim() : '',
      telegram_allow_from: allowFrom,
    }

    try {
      await invoke<void>('save_config', { config: payload })
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存配置失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]" style={{ background: 'var(--bg, #f3efe7)' }}>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="text-lg font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
          配置向导
        </div>

        <div className="mt-4">
          <StepProgress steps={wizardSteps} currentStep={step} />
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
          {step === 0 ? (
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                1. AI 模型选择
              </div>
              <div className="mt-3 text-sm text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                选择预设模型或手动输入模型标识。
              </div>

              <div className="mt-4">
                <label className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                  模型（可选预设 / 可手动输入）
                </label>
                <input
                  list="oc-model-presets"
                  value={modelPrimary}
                  onChange={(e) => setModelPrimary(e.currentTarget.value)}
                  placeholder="例如：moonshot/kimi-k2.5"
                  className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                  style={{
                    border: '1px solid var(--border, #d4c5b5)',
                    color: 'var(--text-primary, #2c1810)',
                  }}
                />
                <datalist id="oc-model-presets">
                  {MODEL_PRESETS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                2. API Key 配置
              </div>
              <div className="mt-3 text-sm text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                当前 Provider：<span style={{ color: 'var(--text-primary, #2c1810)' }}>{provider}</span>
              </div>

              <div className="mt-4">
                <label className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                  {requiredKeyName}
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={requiredKeyValue}
                    onChange={(e) => {
                      const v = e.currentTarget.value
                      setApiKeys((s) => ({ ...s, [requiredKeyName]: v }))
                    }}
                    placeholder={`请输入 ${requiredKeyName}`}
                    className="w-full flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                    style={{
                      border: '1px solid var(--border, #d4c5b5)',
                      color: 'var(--text-primary, #2c1810)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)]"
                    style={{
                      border: '1px solid var(--border, #d4c5b5)',
                      color: 'var(--text-secondary, #6b4c3b)',
                      background: 'transparent',
                    }}
                  >
                    {showKey ? '隐藏' : '显示'}
                  </button>
                </div>
                <div className="mt-2 text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                  Key 只会以安全方式写入本地配置（不在界面中明文展示）。
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                    3. Telegram 配置（可选）
                  </div>
                  <div className="mt-3 text-sm text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                    如果不需要 Telegram 通知，可以跳过。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTelegramEnabled(false)
                    setTelegramBotToken('')
                    setTelegramAllowFromRaw('')
                    setStep(3)
                  }}
                  className="text-sm underline"
                  style={{ color: 'var(--text-secondary, #6b4c3b)' }}
                >
                  跳过 Telegram 配置
                </button>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <input
                  id="oc-telegram-enabled"
                  type="checkbox"
                  checked={telegramEnabled}
                  onChange={(e) => setTelegramEnabled(e.currentTarget.checked)}
                />
                <label htmlFor="oc-telegram-enabled" className="text-sm text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                  启用 Telegram 通知
                </label>
              </div>

              {telegramEnabled ? (
                <div className="mt-4">
                  <div className="mt-2">
                    <label className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                      Bot Token
                    </label>
                    <input
                      value={telegramBotToken}
                      onChange={(e) => setTelegramBotToken(e.currentTarget.value)}
                      placeholder="从 @BotFather 获取，例如：8699735675:AAF..."
                      className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                      style={{
                        border: '1px solid var(--border, #d4c5b5)',
                        color: 'var(--text-primary, #2c1810)',
                      }}
                    />
                  </div>

                  <div className="mt-4">
                    <label className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                      Telegram 用户 ID
                    </label>
                    <input
                      value={telegramAllowFromRaw}
                      onChange={(e) => setTelegramAllowFromRaw(e.currentTarget.value)}
                      placeholder="你的 Telegram 数字 ID，例如：956877904"
                      className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                      style={{
                        border: '1px solid var(--border, #d4c5b5)',
                        color: 'var(--text-primary, #2c1810)',
                      }}
                    />
                    <div className="mt-2 text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                      可填写多个 ID，用逗号或空格分隔。
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-sm text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                  当前未启用 Telegram。
                </div>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <div className="text-sm font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                4. 完成确认
              </div>

              <div className="mt-4 grid gap-3">
                <div className="rounded-lg border border-[var(--border)] bg-white p-3" style={{ border: '1px solid var(--border, #d4c5b5)' }}>
                  <div className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                    模型
                  </div>
                  <div className="mt-1 text-sm text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                    {modelPrimary.trim() || '未选择'}
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-white p-3" style={{ border: '1px solid var(--border, #d4c5b5)' }}>
                  <div className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                    API Key
                  </div>
                  <div className="mt-1 text-sm text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                    {requiredKeyName}: {maskSecret(requiredKeyValue)}
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-white p-3" style={{ border: '1px solid var(--border, #d4c5b5)' }}>
                  <div className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                    Telegram
                  </div>
                  <div className="mt-1 text-sm text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                    {telegramEnabled ? '已启用' : '未启用'}
                  </div>
                  {telegramEnabled ? (
                    <div className="mt-1 text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                      Token: {maskSecret(telegramBotToken)}；AllowFrom: {parseAllowFrom(telegramAllowFromRaw).join(', ') || '未填写'}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 text-sm" style={{ color: 'var(--error, #dc2626)' }}>
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0 || saving}
              className="rounded-lg border border-[var(--border)] px-6 py-2 text-[var(--text-secondary)] disabled:opacity-50"
              style={{
                border: '1px solid var(--border, #d4c5b5)',
                color: 'var(--text-secondary, #6b4c3b)',
                background: 'transparent',
                opacity: step === 0 || saving ? 0.5 : 1,
                cursor: step === 0 || saving ? 'not-allowed' : 'pointer',
              }}
            >
              上一步
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canGoNext || saving}
                className="rounded-lg px-6 py-2 text-white disabled:opacity-50"
                style={{
                  background: 'var(--accent, #c94b1d)',
                  opacity: !canGoNext || saving ? 0.5 : 1,
                  cursor: !canGoNext || saving ? 'not-allowed' : 'pointer',
                }}
              >
                下一步
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onFinish()}
                disabled={saving || modelPrimary.trim().length === 0 || requiredKeyValue.trim().length === 0}
                className="rounded-lg px-6 py-2 text-white disabled:opacity-50"
                style={{
                  background: 'var(--accent, #c94b1d)',
                  opacity: saving || modelPrimary.trim().length === 0 || requiredKeyValue.trim().length === 0 ? 0.5 : 1,
                  cursor:
                    saving || modelPrimary.trim().length === 0 || requiredKeyValue.trim().length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? '正在保存...' : '完成配置'}
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('/welcome', { replace: true })}
              disabled={saving}
              className="rounded-lg border border-[var(--border)] px-6 py-2 text-[var(--text-secondary)] disabled:opacity-50"
              style={{
                border: '1px solid var(--border, #d4c5b5)',
                color: 'var(--text-secondary, #6b4c3b)',
                background: 'transparent',
                opacity: saving ? 0.5 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              返回
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

