import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import StepProgress from '../components/StepProgress'
import type { ConfigSnapshot, SaveConfigPayload } from '../types/ipc'

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
  const [telegramTesting, setTelegramTesting] = useState(false)
  const [telegramSending, setTelegramSending] = useState(false)
  const [telegramTestMsg, setTelegramTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [feishuEnabled, setFeishuEnabled] = useState(false)
  const [feishuDomain, setFeishuDomain] = useState<'feishu' | 'lark'>('feishu')
  const [feishuAppId, setFeishuAppId] = useState('')
  const [feishuAppSecret, setFeishuAppSecret] = useState('')
  const [feishuBotName, setFeishuBotName] = useState('')
  const [feishuAppIdSet, setFeishuAppIdSet] = useState(false)
  const [feishuAppSecretSet, setFeishuAppSecretSet] = useState(false)
  const [feishuReceiveIdType, setFeishuReceiveIdType] = useState<'open_id' | 'chat_id' | 'user_id' | 'email'>('open_id')
  const [feishuReceiveId, setFeishuReceiveId] = useState('')
  const [feishuTesting, setFeishuTesting] = useState(false)
  const [feishuSending, setFeishuSending] = useState(false)
  const [feishuTestMsg, setFeishuTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [envKeysPresent, setEnvKeysPresent] = useState<string[]>([])
  const [telegramTokenSet, setTelegramTokenSet] = useState(false)
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const provider = useMemo(() => getProvider(modelPrimary), [modelPrimary])
  const requiredKeyName = useMemo(() => PROVIDER_KEY_MAP[provider] ?? 'API_KEY', [provider])
  const requiredKeyValue = apiKeys[requiredKeyName] ?? ''
  const requiredKeyPresent = useMemo(
    () => envKeysPresent.includes(requiredKeyName),
    [envKeysPresent, requiredKeyName],
  )

  const wizardSteps = useMemo(() => ['选择模型', '配置密钥', '渠道配置', '确认完成'], [])

  const canGoNext = useMemo(() => {
    if (step === 0) return modelPrimary.trim().length > 0
    if (step === 1) return requiredKeyValue.trim().length > 0 || requiredKeyPresent
    if (step === 2) {
      const telegramOk = !telegramEnabled
        ? true
        : (telegramBotToken.trim().length > 0 || telegramTokenSet) &&
          parseAllowFrom(telegramAllowFromRaw).length > 0

      const feishuOk = !feishuEnabled
        ? true
        : (feishuAppId.trim().length > 0 || feishuAppIdSet) &&
          (feishuAppSecret.trim().length > 0 || feishuAppSecretSet)

      return telegramOk && feishuOk
    }
    return true
  }, [
    step,
    modelPrimary,
    requiredKeyValue,
    requiredKeyPresent,
    telegramEnabled,
    telegramBotToken,
    telegramTokenSet,
    telegramAllowFromRaw,
    feishuEnabled,
    feishuAppId,
    feishuAppIdSet,
    feishuAppSecret,
    feishuAppSecretSet,
  ])

  useEffect(() => {
    if (!isTauriRuntime()) return

    setLoadingSnapshot(true)
    invoke<ConfigSnapshot>('load_config')
      .then((snap) => {
        const model = snap.model_primary?.trim()
        if (model) setModelPrimary(model)

        setEnvKeysPresent(snap.env_keys_present ?? [])

        setTelegramEnabled(Boolean(snap.telegram_enabled))
        setTelegramTokenSet(Boolean(snap.telegram_bot_token_set))
        setTelegramAllowFromRaw((snap.telegram_allow_from ?? []).join(', '))

        setFeishuEnabled(Boolean(snap.feishu_enabled))
        setFeishuDomain(snap.feishu_domain === 'lark' ? 'lark' : 'feishu')
        setFeishuBotName(snap.feishu_bot_name ?? '')
        setFeishuAppIdSet(Boolean(snap.feishu_app_id_set))
        setFeishuAppSecretSet(Boolean(snap.feishu_app_secret_set))
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : '读取现有配置失败')
      })
      .finally(() => {
        setLoadingSnapshot(false)
      })
  }, [])

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
      feishu_enabled: feishuEnabled,
      feishu_domain: feishuDomain,
      feishu_app_id: feishuEnabled ? feishuAppId.trim() : '',
      feishu_app_secret: feishuEnabled ? feishuAppSecret.trim() : '',
      feishu_bot_name: feishuEnabled ? feishuBotName.trim() : '',
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

  async function handleTelegramTest() {
    setTelegramTesting(true)
    setTelegramTestMsg(null)
    try {
      if (!isTauriRuntime()) throw new Error('浏览器预览模式无法测试，请用 Tauri 应用运行')
      const msg = await invoke<string>('test_telegram', { botToken: telegramBotToken.trim() })
      setTelegramTestMsg({ ok: true, text: msg })
    } catch (e) {
      setTelegramTestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setTelegramTesting(false)
    }
  }

  async function handleTelegramSendTest() {
    setTelegramSending(true)
    setTelegramTestMsg(null)
    try {
      if (!isTauriRuntime()) throw new Error('浏览器预览模式无法发送，请用 Tauri 应用运行')
      const allowFrom = parseAllowFrom(telegramAllowFromRaw)
      if (allowFrom.length === 0) throw new Error('请先填写 Telegram 用户 ID（AllowFrom）')
      const chatId = allowFrom[0]
      const text = `OpenClaw 测试消息（Telegram）：${new Date().toLocaleString()}`
      const msg = await invoke<string>('send_telegram_test_message', { botToken: telegramBotToken.trim(), chatId, text })
      setTelegramTestMsg({ ok: true, text: msg })
    } catch (e) {
      setTelegramTestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setTelegramSending(false)
    }
  }

  async function handleFeishuTest() {
    setFeishuTesting(true)
    setFeishuTestMsg(null)
    try {
      if (!isTauriRuntime()) throw new Error('浏览器预览模式无法测试，请用 Tauri 应用运行')
      const msg = await invoke<string>('test_feishu', {
        domain: feishuDomain,
        appId: feishuAppId.trim(),
        appSecret: feishuAppSecret.trim(),
      })
      setFeishuTestMsg({ ok: true, text: msg })
    } catch (e) {
      setFeishuTestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setFeishuTesting(false)
    }
  }

  async function handleFeishuSendTest() {
    setFeishuSending(true)
    setFeishuTestMsg(null)
    try {
      if (!isTauriRuntime()) throw new Error('浏览器预览模式无法发送，请用 Tauri 应用运行')
      const receiveId = feishuReceiveId.trim()
      if (!receiveId) throw new Error('请先填写接收者 ID（receive_id）')
      const text = `OpenClaw 测试消息（飞书/Lark）：${new Date().toLocaleString()}`
      const msg = await invoke<string>('send_feishu_test_message', {
        domain: feishuDomain,
        appId: feishuAppId.trim(),
        appSecret: feishuAppSecret.trim(),
        receiveIdType: feishuReceiveIdType,
        receiveId,
        text,
      })
      setFeishuTestMsg({ ok: true, text: msg })
    } catch (e) {
      setFeishuTestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setFeishuSending(false)
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
                    placeholder={
                      requiredKeyPresent
                        ? `本地已存在 ${requiredKeyName}（留空表示不修改）`
                        : `请输入 ${requiredKeyName}`
                    }
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
              <div className="text-sm font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                3. 渠道配置（可选）
              </div>
              <div className="mt-3 text-sm text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                当前支持 Telegram / 飞书（Lark）。QQ / 微信将于后续版本补充。
              </div>

              {/* Telegram */}
              <div className="mt-4 rounded-lg border border-[var(--border)] bg-white p-3" style={{ border: '1px solid var(--border, #d4c5b5)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                    Telegram
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                    <input
                      id="oc-telegram-enabled"
                      type="checkbox"
                      checked={telegramEnabled}
                      onChange={(e) => setTelegramEnabled(e.currentTarget.checked)}
                    />
                    启用
                  </label>
                </div>

                {telegramEnabled ? (
                  <div className="mt-3">
                  <div className="mt-2">
                    <label className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                      Bot Token
                    </label>
                    <input
                      value={telegramBotToken}
                      onChange={(e) => setTelegramBotToken(e.currentTarget.value)}
                      placeholder={
                        telegramTokenSet
                          ? '已配置（留空表示不修改），如需更换请重新输入'
                          : '从 @BotFather 获取，例如：8699735675:AAF...'
                      }
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

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleTelegramTest()}
                      disabled={telegramTesting || saving}
                      className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50"
                      style={{
                        border: '1px solid var(--border, #d4c5b5)',
                        color: 'var(--text-secondary, #6b4c3b)',
                        background: 'transparent',
                        cursor: telegramTesting || saving ? 'not-allowed' : 'pointer',
                        opacity: telegramTesting || saving ? 0.5 : 1,
                      }}
                    >
                      {telegramTesting ? '测试中…' : '测试连通性'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleTelegramSendTest()}
                      disabled={telegramSending || saving}
                      className="rounded-lg px-4 py-2 text-sm text-white disabled:opacity-50"
                      style={{
                        background: 'var(--accent, #c94b1d)',
                        cursor: telegramSending || saving ? 'not-allowed' : 'pointer',
                        opacity: telegramSending || saving ? 0.5 : 1,
                      }}
                    >
                      {telegramSending ? '发送中…' : '发送测试消息'}
                    </button>
                  </div>

                  {telegramTestMsg ? (
                    <div
                      className="mt-3 rounded-lg border px-3 py-2 text-sm"
                      style={{
                        border: `1px solid ${telegramTestMsg.ok ? 'rgba(45,122,79,0.25)' : 'rgba(220,38,38,0.25)'}`,
                        background: telegramTestMsg.ok ? 'rgba(45,122,79,0.06)' : 'rgba(220,38,38,0.06)',
                        color: telegramTestMsg.ok ? 'var(--success, #2d7a4f)' : 'var(--error, #dc2626)',
                      }}
                    >
                      {telegramTestMsg.ok ? '✓ ' : '✗ '}{telegramTestMsg.text}
                    </div>
                  ) : null}

                  <div className="mt-3 text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                    提示：发送测试消息前，需先在 Telegram 打开你的 Bot 并发送一次 <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>/start</span>。
                    启用/修改配置后请重启 Gateway 生效；如日志提示插件缺失，请在「诊断修复」运行 <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>openclaw doctor</span>。
                  </div>
                </div>
                ) : (
                  <div className="mt-3 text-sm text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                    当前未启用 Telegram。
                  </div>
                )}
              </div>

              {/* Feishu */}
              <div className="mt-4 rounded-lg border border-[var(--border)] bg-white p-3" style={{ border: '1px solid var(--border, #d4c5b5)' }}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                    飞书 / Lark
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                    <input
                      id="oc-feishu-enabled"
                      type="checkbox"
                      checked={feishuEnabled}
                      onChange={(e) => setFeishuEnabled(e.currentTarget.checked)}
                    />
                    启用
                  </label>
                </div>

                {feishuEnabled ? (
                  <div className="mt-3">
                    <div className="mt-2">
                      <label className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                        区域
                      </label>
                      <select
                        value={feishuDomain}
                        onChange={(e) => setFeishuDomain(e.currentTarget.value === 'lark' ? 'lark' : 'feishu')}
                        className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                        style={{
                          border: '1px solid var(--border, #d4c5b5)',
                          color: 'var(--text-primary, #2c1810)',
                        }}
                      >
                        <option value="feishu">飞书（中国大陆）</option>
                        <option value="lark">Lark（海外）</option>
                      </select>
                      <div className="mt-2 text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                        海外版本请选择 Lark，并使用 https://open.larksuite.com 创建应用。
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                        App ID
                      </label>
                      <input
                        value={feishuAppId}
                        onChange={(e) => setFeishuAppId(e.currentTarget.value)}
                        placeholder={feishuAppIdSet ? '已配置（留空表示不修改）' : '例如：cli_a1b2c3d4e5f6...'}
                        className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                        style={{
                          border: '1px solid var(--border, #d4c5b5)',
                          color: 'var(--text-primary, #2c1810)',
                        }}
                      />
                    </div>

                    <div className="mt-4">
                      <label className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                        App Secret
                      </label>
                      <input
                        type="password"
                        value={feishuAppSecret}
                        onChange={(e) => setFeishuAppSecret(e.currentTarget.value)}
                        placeholder={feishuAppSecretSet ? '已配置（留空表示不修改）' : '请输入 App Secret'}
                        className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                        style={{
                          border: '1px solid var(--border, #d4c5b5)',
                          color: 'var(--text-primary, #2c1810)',
                        }}
                      />
                      <div className="mt-2 text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                        凭据会写入本地 openclaw.json，不会上传。
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                        Bot 名称（可选）
                      </label>
                      <input
                        value={feishuBotName}
                        onChange={(e) => setFeishuBotName(e.currentTarget.value)}
                        placeholder="例如：OpenClaw"
                        className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                        style={{
                          border: '1px solid var(--border, #d4c5b5)',
                          color: 'var(--text-primary, #2c1810)',
                        }}
                      />
                    </div>

                    <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3" style={{ border: '1px solid var(--border, #d4c5b5)', background: 'var(--bg-card, #faf7f2)' }}>
                      <div className="text-xs font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                        测试发送（可选）
                      </div>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                            接收者类型（receive_id_type）
                          </label>
                          <select
                            value={feishuReceiveIdType}
                            onChange={(e) => {
                              const v = e.currentTarget.value as any
                              setFeishuReceiveIdType(v === 'chat_id' || v === 'user_id' || v === 'email' ? v : 'open_id')
                            }}
                            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                            style={{
                              border: '1px solid var(--border, #d4c5b5)',
                              color: 'var(--text-primary, #2c1810)',
                            }}
                          >
                            <option value="open_id">open_id</option>
                            <option value="chat_id">chat_id</option>
                            <option value="user_id">user_id</option>
                            <option value="email">email</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                            接收者 ID（receive_id）
                          </label>
                          <input
                            value={feishuReceiveId}
                            onChange={(e) => setFeishuReceiveId(e.currentTarget.value)}
                            placeholder="open_id / chat_id / user_id / email"
                            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                            style={{
                              border: '1px solid var(--border, #d4c5b5)',
                              color: 'var(--text-primary, #2c1810)',
                            }}
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleFeishuTest()}
                          disabled={feishuTesting || saving}
                          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-50"
                          style={{
                            border: '1px solid var(--border, #d4c5b5)',
                            color: 'var(--text-secondary, #6b4c3b)',
                            background: 'transparent',
                            cursor: feishuTesting || saving ? 'not-allowed' : 'pointer',
                            opacity: feishuTesting || saving ? 0.5 : 1,
                          }}
                        >
                          {feishuTesting ? '测试中…' : '测试连通性'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleFeishuSendTest()}
                          disabled={feishuSending || saving}
                          className="rounded-lg px-4 py-2 text-sm text-white disabled:opacity-50"
                          style={{
                            background: 'var(--accent, #c94b1d)',
                            cursor: feishuSending || saving ? 'not-allowed' : 'pointer',
                            opacity: feishuSending || saving ? 0.5 : 1,
                          }}
                        >
                          {feishuSending ? '发送中…' : '发送测试消息'}
                        </button>
                      </div>

                      {feishuTestMsg ? (
                        <div
                          className="mt-3 rounded-lg border px-3 py-2 text-sm"
                          style={{
                            border: `1px solid ${feishuTestMsg.ok ? 'rgba(45,122,79,0.25)' : 'rgba(220,38,38,0.25)'}`,
                            background: feishuTestMsg.ok ? 'rgba(45,122,79,0.06)' : 'rgba(220,38,38,0.06)',
                            color: feishuTestMsg.ok ? 'var(--success, #2d7a4f)' : 'var(--error, #dc2626)',
                          }}
                        >
                          {feishuTestMsg.ok ? '✓ ' : '✗ '}{feishuTestMsg.text}
                        </div>
                      ) : null}

                      <div className="mt-3 text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                        提示：飞书/Lark 发送消息需要应用具备 IM 权限/范围，且机器人已被安装到对应会话；如失败请根据返回错误码检查权限与安装状态。
                        启用/修改配置后请重启 Gateway 生效；如日志提示插件缺失，请在「诊断修复」运行 <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>openclaw doctor</span>。
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                    当前未启用飞书/Lark。
                  </div>
                )}
              </div>

              {/* Coming soon */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { name: 'QQ', desc: '后续版本补充' },
                  { name: '微信', desc: '后续版本补充' },
                ].map((c) => (
                  <div
                    key={c.name}
                    className="rounded-lg border border-[var(--border)] bg-white p-3 opacity-60"
                    style={{ border: '1px solid var(--border, #d4c5b5)' }}
                  >
                    <div className="text-sm font-semibold text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                      {c.name}
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                      {c.desc}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
                  style={{
                    border: '1px solid var(--border, #d4c5b5)',
                    color: 'var(--text-secondary, #6b4c3b)',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  打开控制台
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/repair')}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
                  style={{
                    border: '1px solid var(--border, #d4c5b5)',
                    color: 'var(--text-secondary, #6b4c3b)',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  诊断修复
                </button>
              </div>
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
                    {requiredKeyName}:{' '}
                    {requiredKeyValue.trim().length > 0
                      ? maskSecret(requiredKeyValue)
                      : requiredKeyPresent
                        ? '已存在（未更改）'
                        : '未填写'}
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
                      Token:{' '}
                      {telegramBotToken.trim().length > 0
                        ? maskSecret(telegramBotToken)
                        : telegramTokenSet
                          ? '已存在（未更改）'
                          : '未填写'}
                      ；AllowFrom: {parseAllowFrom(telegramAllowFromRaw).join(', ') || '未填写'}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-white p-3" style={{ border: '1px solid var(--border, #d4c5b5)' }}>
                  <div className="text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                    飞书 / Lark
                  </div>
                  <div className="mt-1 text-sm text-[var(--text-primary)]" style={{ color: 'var(--text-primary, #2c1810)' }}>
                    {feishuEnabled ? '已启用' : '未启用'}
                  </div>
                  {feishuEnabled ? (
                    <div className="mt-1 text-xs text-[var(--text-secondary)]" style={{ color: 'var(--text-secondary, #6b4c3b)' }}>
                      Domain: {feishuDomain}；App ID:{' '}
                      {feishuAppId.trim().length > 0
                        ? maskSecret(feishuAppId)
                        : feishuAppIdSet
                          ? '已存在（未更改）'
                          : '未填写'}
                      ；Secret:{' '}
                      {feishuAppSecret.trim().length > 0
                        ? maskSecret(feishuAppSecret)
                        : feishuAppSecretSet
                          ? '已存在（未更改）'
                          : '未填写'}
                      {feishuBotName.trim() ? `；BotName: ${feishuBotName.trim()}` : ''}
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
                disabled={!canGoNext || saving || loadingSnapshot}
                className="rounded-lg px-6 py-2 text-white disabled:opacity-50"
                style={{
                  background: 'var(--accent, #c94b1d)',
                  opacity: !canGoNext || saving || loadingSnapshot ? 0.5 : 1,
                  cursor: !canGoNext || saving || loadingSnapshot ? 'not-allowed' : 'pointer',
                }}
              >
                下一步
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onFinish()}
                disabled={
                  saving ||
                  loadingSnapshot ||
                  modelPrimary.trim().length === 0 ||
                  (requiredKeyValue.trim().length === 0 && !requiredKeyPresent) ||
                  (telegramEnabled &&
                    (parseAllowFrom(telegramAllowFromRaw).length === 0 ||
                      (telegramBotToken.trim().length === 0 && !telegramTokenSet)))
                  ||
                  (feishuEnabled &&
                    ((feishuAppId.trim().length === 0 && !feishuAppIdSet) ||
                      (feishuAppSecret.trim().length === 0 && !feishuAppSecretSet)))
                }
                className="rounded-lg px-6 py-2 text-white disabled:opacity-50"
                style={{
                  background: 'var(--accent, #c94b1d)',
                  opacity:
                    saving ||
                    loadingSnapshot ||
                    modelPrimary.trim().length === 0 ||
                    (requiredKeyValue.trim().length === 0 && !requiredKeyPresent)
                      ? 0.5
                      : 1,
                  cursor:
                    saving || loadingSnapshot || modelPrimary.trim().length === 0 || (requiredKeyValue.trim().length === 0 && !requiredKeyPresent)
                      ? 'not-allowed'
                      : 'pointer',
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
