import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'

interface AgentConfig {
  provider: string
  base_url: string
  model: string
  max_tokens: number
  api_key_set: boolean
}

const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', desc: '快速 · 低成本' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', desc: '推荐 · 均衡（默认）' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', desc: '最强 · 高成本' },
]

const TOKEN_OPTIONS = [2048, 4096, 8192]

const COMMON_ENDPOINTS = [
  { label: 'OpenAI', url: 'https://api.openai.com/v1' },
  { label: 'DeepSeek', url: 'https://api.deepseek.com/v1' },
  { label: 'Moonshot (海外)', url: 'https://api.moonshot.ai/v1' },
  { label: 'Moonshot (中国)', url: 'https://api.moonshot.cn/v1' },
  { label: 'Qwen (阿里云)', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
]

export default function AgentConfig() {
  const navigate = useNavigate()
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [provider, setProvider] = useState<'anthropic' | 'openai_compat'>('anthropic')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [maxTokens, setMaxTokens] = useState(4096)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    invoke<AgentConfig>('get_agent_config')
      .then(c => {
        setConfig(c)
        setProvider((c.provider === 'openai_compat' ? 'openai_compat' : 'anthropic'))
        setBaseUrl(c.base_url ?? '')
        setModel(c.model)
        setMaxTokens(c.max_tokens)
      })
      .catch(() => {})
  }, [])

  // When switching provider, reset model to a sensible default
  function handleProviderChange(p: 'anthropic' | 'openai_compat') {
    setProvider(p)
    if (p === 'anthropic') {
      setModel('claude-sonnet-4-6')
    } else {
      setModel('')
    }
    setTestMsg(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    try {
      await invoke('save_agent_config', { provider, baseUrl, model, maxTokens, apiKey })
      setConfig(prev => prev
        ? { ...prev, provider, base_url: baseUrl, model, max_tokens: maxTokens, api_key_set: prev.api_key_set || apiKey.trim().length > 0 }
        : null
      )
      setApiKey('')
      setSaveMsg({ text: '配置已保存', ok: true })
    } catch (e) {
      setSaveMsg({ text: `保存失败：${e}`, ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestMsg(null)
    try {
      let key = apiKey.trim()
      if (!key) {
        key = await invoke<string>('get_agent_api_key')
      }

      if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 64,
            messages: [{ role: 'user', content: 'Reply with only: OK' }],
          }),
        })
        if (res.ok) {
          setTestMsg({ text: `连接成功（模型: ${model}）`, ok: true })
        } else {
          const txt = await res.text()
          setTestMsg({ text: `连接失败 ${res.status}: ${txt.slice(0, 120)}`, ok: false })
        }
      } else {
        const url = baseUrl.replace(/\/$/, '')
        if (!url) {
          setTestMsg({ text: '请先填写 API Base URL', ok: false })
          return
        }

        // Step 1: 尝试 GET /models 验证 key 有效性（不消耗 token）
        try {
          const modelsRes = await fetch(`${url}/models`, {
            headers: { 'Authorization': `Bearer ${key}` },
          })
          if (modelsRes.ok) {
            const data = await modelsRes.json().catch(() => null)
            const count = data?.data?.length ?? '?'
            setTestMsg({ text: `连接成功，Key 有效（可用模型 ${count} 个）`, ok: true })
            return
          }
        } catch {
          // /models 不可用，降级到 Step 2
        }

        // Step 2: 降级用 chat/completions 测试
        const res = await fetch(`${url}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: model || 'gpt-3.5-turbo',
            max_tokens: 16,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        })
        if (res.ok) {
          setTestMsg({ text: `连接成功（模型: ${model || '默认'}）`, ok: true })
        } else {
          const txt = await res.text().catch(() => '')
          try {
            const err = JSON.parse(txt)
            const msg = err?.error?.message ?? txt
            setTestMsg({ text: `端点可达，但请求失败：${msg.slice(0, 100)}`, ok: false })
          } catch {
            setTestMsg({ text: `连接失败 ${res.status}: ${txt.slice(0, 100)}`, ok: false })
          }
        }
      }
    } catch (e) {
      setTestMsg({ text: `连接失败：${e instanceof Error ? e.message : String(e)}`, ok: false })
    } finally {
      setTesting(false)
    }
  }

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
        <button
          onClick={() => navigate('/agent')}
          style={{ background: 'none', border: 'none', color: '#007AFF', fontSize: 13, cursor: 'pointer', padding: 0 }}
        >
          ← 返回
        </button>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#000' }}>AI 助手配置</span>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Provider 选择 */}
        <Section title="服务商">
          <div style={{ padding: '10px 16px', display: 'flex', gap: 8 }}>
            {(['anthropic', 'openai_compat'] as const).map(p => (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                style={{
                  flex: 1,
                  padding: '9px 8px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: provider === p ? 600 : 400,
                  background: provider === p ? '#007AFF' : 'rgba(60,60,67,0.06)',
                  color: provider === p ? '#fff' : '#3C3C43',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {p === 'anthropic' ? 'Anthropic (官方)' : 'OpenAI 兼容'}
              </button>
            ))}
          </div>
        </Section>

        {/* OpenAI compat: URL + Model */}
        {provider === 'openai_compat' && (
          <Section title="接口配置">
            <div style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 12, color: '#636366', marginBottom: 6 }}>API Base URL</div>
              <input
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                style={inputStyle}
              />
              {/* Quick-fill buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {COMMON_ENDPOINTS.map(ep => (
                  <button
                    key={ep.url}
                    onClick={() => {
                      setBaseUrl(ep.url)
                      if (!model.trim() && ep.url.includes('moonshot')) {
                        setModel('kimi-k2.5')
                      }
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 11,
                      background: baseUrl === ep.url ? 'rgba(0,122,255,0.12)' : 'rgba(60,60,67,0.07)',
                      color: baseUrl === ep.url ? '#007AFF' : '#636366',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {ep.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: '0 16px 12px', borderTop: '0.5px solid rgba(60,60,67,0.08)', paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: '#636366', marginBottom: 6 }}>模型名称</div>
              <input
                type="text"
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="kimi-k2.5 / gpt-4o / deepseek-chat / moonshot-v1-8k ..."
                style={inputStyle}
              />
            </div>
          </Section>
        )}

        {/* Anthropic: Model 选择 */}
        {provider === 'anthropic' && (
          <Section title="模型选择">
            {ANTHROPIC_MODELS.map((m, i) => (
              <div
                key={m.id}
                onClick={() => setModel(m.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderTop: i === 0 ? 'none' : '0.5px solid rgba(60,60,67,0.1)',
                  cursor: 'pointer',
                  background: model === m.id ? 'rgba(0,122,255,0.04)' : 'transparent',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: `2px solid ${model === m.id ? '#007AFF' : 'rgba(60,60,67,0.25)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {model === m.id && (
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#007AFF' }} />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#000' }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: '#636366', marginTop: 1 }}>{m.desc}</div>
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* API Key */}
        <Section title="API Key">
          <div style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: '#636366' }}>当前状态：</span>
              {config?.api_key_set ? (
                <span style={{ fontSize: 13, fontWeight: 600, color: '#34C759' }}>✓ 已配置</span>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 600, color: '#FF3B30' }}>✗ 未配置</span>
              )}
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={config?.api_key_set ? '输入新 Key 以更新（留空则保持不变）' : '输入 API Key'}
              style={{ ...inputStyle, fontFamily: 'ui-monospace, Menlo, monospace' }}
            />
            <div style={{ marginTop: 6, fontSize: 11, color: '#AEAEB2' }}>
              Key 仅保存在本地 ~/.openclaw/agent.env（与 OpenClaw 主配置分离），不会上传
            </div>
          </div>
        </Section>

        {/* Max Tokens */}
        <Section title="最大 Token">
          <div style={{ display: 'flex', gap: 0, padding: '10px 16px' }}>
            {TOKEN_OPTIONS.map((t, i) => (
              <button
                key={t}
                onClick={() => setMaxTokens(t)}
                style={{
                  flex: 1,
                  padding: '8px',
                  fontSize: 13,
                  fontWeight: maxTokens === t ? 600 : 400,
                  background: maxTokens === t ? '#007AFF' : 'rgba(60,60,67,0.06)',
                  color: maxTokens === t ? '#fff' : '#3C3C43',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: i === 0 ? '8px 0 0 8px' : i === TOKEN_OPTIONS.length - 1 ? '0 8px 8px 0' : 0,
                  borderRight: i < TOKEN_OPTIONS.length - 1 ? '0.5px solid rgba(60,60,67,0.15)' : 'none',
                }}
              >
                {t.toLocaleString()}
              </button>
            ))}
          </div>
        </Section>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleTest}
            disabled={testing}
            style={{
              flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 500,
              background: 'rgba(0,122,255,0.08)', color: '#007AFF',
              border: 'none', cursor: testing ? 'default' : 'pointer', opacity: testing ? 0.7 : 1,
            }}
          >
            {testing ? '测试中...' : '测试连接'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: '#007AFF', color: '#fff',
              border: 'none', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>

        {testMsg && (
          <StatusBadge ok={testMsg.ok} text={testMsg.text} />
        )}
        {saveMsg && (
          <StatusBadge ok={saveMsg.ok} text={saveMsg.text} />
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '0.5px solid rgba(60,60,67,0.25)',
  background: '#F9F9F9',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  color: '#000',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#636366', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6, paddingLeft: 4 }}>
        {title}
      </div>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function StatusBadge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8, fontSize: 13,
      background: ok ? 'rgba(52,199,89,0.07)' : 'rgba(255,59,48,0.06)',
      border: `1px solid ${ok ? 'rgba(52,199,89,0.25)' : 'rgba(255,59,48,0.2)'}`,
      color: ok ? '#34C759' : '#FF3B30',
      lineHeight: 1.5,
    }}>
      {ok ? '✓ ' : '✗ '}{text}
    </div>
  )
}
