import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import { useAgent } from '../hooks/useAgent'
import type { ChatMessage } from '../hooks/useAgent'
import { useInstallLog } from '../hooks/useInstallLog'
import { useInstallStore } from '../stores/installStore'
import type { InstallLogPayload } from '../stores/installStore'

const REPAIR_SYSTEM_PROMPT = `你是 OpenClaw 专项修复助手，专注于诊断和修复 OpenClaw 运行问题。
界面右侧面板实时显示命令执行日志，当你触发修复操作（run_repair/run_shell）后，日志会自动出现在右侧。

工作流程：
1. 优先使用只读工具（get_system_info、get_openclaw_status、read_gateway_log）收集信息
2. 分析问题根因，给出简洁的中文诊断结论
3. 针对性提出修复方案，每次操作必须通过授权卡片让用户确认
4. 授权执行后，查看右侧日志确认操作结果

注意：[telegram] 网络错误在中国大陆属正常现象，[memory] fts 错误通常无需处理。`

function formatTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export default function AgentRepair() {
  const navigate = useNavigate()
  const [agentOpts, setAgentOpts] = useState<{
    model: string
    maxTokens: number
    provider: 'anthropic' | 'openai_compat'
    baseUrl: string
    systemPromptOverride: string
  } | undefined>()
  const [configLoaded, setConfigLoaded] = useState(false)

  // Load agent config before initializing useAgent
  useEffect(() => {
    invoke<{ provider: string; base_url: string; model: string; max_tokens: number }>('get_agent_config')
      .then(c => {
        setAgentOpts({
          model: c.model,
          maxTokens: c.max_tokens,
          provider: c.provider === 'openai_compat' ? 'openai_compat' : 'anthropic',
          baseUrl: c.base_url ?? '',
          systemPromptOverride: REPAIR_SYSTEM_PROMPT,
        })
      })
      .catch(() => {})
      .finally(() => setConfigLoaded(true))
  }, [])

  const {
    messages,
    isLoading,
    apiKeyError,
    pendingTool,
    loadApiKey,
    sendMessage,
    approveTool,
    denyTool,
    resetConversation,
    getToolLabel,
  } = useAgent(agentOpts ? { ...agentOpts, storageKey: 'openclaw-agent-repair' } : { storageKey: 'openclaw-agent-repair' })

  // Right panel: live execution logs
  useInstallLog()
  const logs = useInstallStore(s => s.logs)
  const clearLogs = useInstallStore(s => s.clearLogs)

  const chatBottomRef = useRef<HTMLDivElement>(null)
  const logBottomRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const autoStarted = useRef(false)

  useEffect(() => {
    if (configLoaded) loadApiKey()
  }, [configLoaded, loadApiKey])

  // Auto-send initial diagnostic message once
  useEffect(() => {
    if (configLoaded && !autoStarted.current && messages.length === 0 && !apiKeyError) {
      autoStarted.current = true
      setTimeout(() => {
        sendMessage('你好，请先读取我的系统状态，告诉我当前 OpenClaw 的整体健康情况。')
      }, 500)
    }
  }, [configLoaded, messages.length, apiKeyError, sendMessage])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    logBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  function handleSend() {
    const text = input.trim()
    if (!text || isLoading || pendingTool) return
    setInput('')
    sendMessage(text)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F2F2F7', display: 'flex', flexDirection: 'column' }}>
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
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/agent')}
          style={{ background: 'none', border: 'none', color: '#007AFF', fontSize: 13, cursor: 'pointer', padding: 0 }}
        >
          ← 返回
        </button>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#000' }}>AI 修复助手</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => { resetConversation(); autoStarted.current = false }}
            style={{ background: 'none', border: 'none', color: '#636366', fontSize: 12, cursor: 'pointer', padding: 0 }}
          >
            重置对话
          </button>
          <button
            onClick={clearLogs}
            style={{ background: 'none', border: 'none', color: '#636366', fontSize: 12, cursor: 'pointer', padding: 0 }}
          >
            清空日志
          </button>
        </div>
      </div>

      {/* API Key error */}
      {apiKeyError && (
        <div style={{
          margin: '12px 16px 0',
          padding: '10px 14px',
          background: 'rgba(255,59,48,0.06)',
          border: '1px solid rgba(255,59,48,0.2)',
          borderRadius: 10,
          fontSize: 13,
          color: '#FF3B30',
        }}>
          ⚠️ {apiKeyError}
          <button
            onClick={() => navigate('/agent-config')}
            style={{ marginLeft: 10, background: 'none', border: 'none', color: '#007AFF', fontSize: 12, cursor: 'pointer' }}
          >
            → 配置 AI 助手
          </button>
        </div>
      )}

      {/* Main content: dual panel */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 1.2fr',
        gap: 12,
        padding: '12px 16px',
        maxWidth: 900,
        width: '100%',
        margin: '0 auto',
        alignItems: 'start',
        minHeight: 0,
      }}>
        {/* Left: Chat */}
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 76px)' }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            {messages.length === 0 && !isLoading && (
              <div style={{ textAlign: 'center', color: '#AEAEB2', fontSize: 12, marginTop: 40 }}>
                正在准备诊断...
              </div>
            )}
            {messages.map(msg => (
              <RepairChatBubble
                key={msg.id}
                msg={msg}
                onApprove={approveTool}
                onDeny={denyTool}
                getToolLabel={getToolLabel}
              />
            ))}
            {isLoading && (
              <div style={{ margin: '4px 0 8px' }}>
                <div style={{
                  display: 'inline-flex',
                  background: '#fff',
                  borderRadius: '14px 14px 14px 4px',
                  padding: '8px 12px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                  gap: 4,
                  alignItems: 'center',
                }}>
                  <ThinkingDots />
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <div style={{
            borderTop: '0.5px solid rgba(60,60,67,0.12)',
            paddingTop: 8,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
            marginTop: 8,
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingTool ? '请先处理授权请求...' : '补充说明或追问...'}
              disabled={!!pendingTool}
              rows={2}
              style={{
                flex: 1,
                background: '#fff',
                border: '0.5px solid rgba(60,60,67,0.2)',
                borderRadius: 12,
                padding: '8px 12px',
                fontSize: 13,
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                color: '#000',
                opacity: pendingTool ? 0.5 : 1,
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading || !!pendingTool || !!apiKeyError}
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: (!input.trim() || isLoading || !!pendingTool || !!apiKeyError) ? 'rgba(60,60,67,0.12)' : '#007AFF',
                border: 'none',
                cursor: (!input.trim() || isLoading || !!pendingTool || !!apiKeyError) ? 'default' : 'pointer',
                color: '#fff',
                fontSize: 15,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ↑
            </button>
          </div>
        </div>

        {/* Right: Log panel */}
        <div style={{
          background: '#1C1C1E',
          borderRadius: 12,
          overflow: 'hidden',
          height: 'calc(100vh - 76px)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            padding: '10px 14px',
            borderBottom: '0.5px solid rgba(255,255,255,0.08)',
            fontSize: 12,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: 0.5,
            flexShrink: 0,
          }}>
            EXECUTION LOG {logs.length > 0 && `· ${logs.length} 条`}
          </div>
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px 14px',
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: 11,
            lineHeight: 1.7,
          }}>
            {logs.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                等待执行操作...
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} style={{ color: logColor(log), wordBreak: 'break-all' }}>
                  [{formatTime(log.timestamp)}] {log.message}
                </div>
              ))
            )}
            <div ref={logBottomRef} />
          </div>
        </div>
      </div>
    </div>
  )
}

function logColor(log: InstallLogPayload): string {
  const m = log.message.toLowerCase()
  if (m.includes('error') || m.includes('fail') || m.includes('错误')) return '#f87171'
  if (m.includes('warn') || m.includes('警告')) return '#fbbf24'
  if (m.includes('done') || m.includes('success') || m.includes('完成') || m.includes('✓')) return '#4ade80'
  return 'rgba(255,255,255,0.75)'
}

function RepairChatBubble({
  msg,
  onApprove,
  onDeny,
  getToolLabel,
}: {
  msg: ChatMessage
  onApprove: () => void
  onDeny: () => void
  getToolLabel: (name: string) => string
}) {
  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <div style={{
          maxWidth: '80%',
          background: '#007AFF',
          color: '#fff',
          borderRadius: '14px 14px 4px 14px',
          padding: '8px 12px',
          fontSize: 13,
          lineHeight: 1.5,
          wordBreak: 'break-word',
        }}>
          {msg.text}
        </div>
      </div>
    )
  }

  if (msg.role === 'assistant') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 6 }}>
        <div style={{
          maxWidth: '90%',
          background: '#fff',
          color: '#000',
          borderRadius: '14px 14px 14px 4px',
          padding: '8px 12px',
          fontSize: 13,
          lineHeight: 1.6,
          wordBreak: 'break-word',
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
          whiteSpace: 'pre-wrap',
        }}>
          {msg.text}
        </div>
      </div>
    )
  }

  if (msg.role === 'system') {
    return (
      <div style={{ textAlign: 'center', fontSize: 10, color: '#AEAEB2', margin: '3px 0 6px', letterSpacing: 0.2 }}>
        {msg.text}
      </div>
    )
  }

  if (msg.role === 'tool_pending') {
    const toolName = msg.toolName ?? ''
    const isShell = toolName === 'run_shell'
    const isRepair = toolName === 'run_repair'
    const isSudo = toolName === 'run_sudo_shell'

    const accentColor = isSudo ? '#FF3B30' : '#FF9500'
    const accentBg = isSudo ? 'rgba(255,59,48,0.07)' : 'rgba(255,149,0,0.07)'
    const accentBorder = isSudo ? 'rgba(255,59,48,0.3)' : 'rgba(255,149,0,0.3)'
    const accentDivider = isSudo ? 'rgba(255,59,48,0.18)' : 'rgba(255,149,0,0.18)'
    const headerIcon = isSudo ? '🔴' : '🔐'
    const headerLabel = isSudo ? '需要管理员权限' : '授权请求'
    const approveLabel = isSudo ? '授权执行（需输入系统密码）' : '授权执行'

    return (
      <div style={{
        margin: '4px 0 8px',
        background: '#fff',
        borderRadius: 12,
        border: `1px solid ${accentBorder}`,
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      }}>
        <div style={{
          background: accentBg,
          padding: '8px 12px',
          borderBottom: `0.5px solid ${accentDivider}`,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{ fontSize: 13 }}>{headerIcon}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: accentColor }}>{headerLabel}</span>
          <span style={{ fontSize: 11, color: '#AEAEB2', marginLeft: 'auto' }}>{getToolLabel(toolName)}</span>
        </div>
        {msg.toolReason && (
          <div style={{ padding: '8px 12px 4px', fontSize: 12, color: '#3C3C43', lineHeight: 1.5 }}>
            {msg.toolReason}
          </div>
        )}
        {isSudo && (
          <div style={{
            margin: '4px 12px',
            padding: '5px 8px',
            background: 'rgba(255,59,48,0.06)',
            borderRadius: 6,
            fontSize: 11,
            color: '#FF3B30',
          }}>
            ⚠️ 点击授权后将弹出系统密码输入框
          </div>
        )}
        {(isShell || isSudo) && Boolean(msg.toolInput?.cmd) && (
          <div style={{
            margin: '4px 12px 4px',
            padding: '6px 8px',
            background: '#F2F2F7',
            borderRadius: 6,
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: 11,
            color: '#3C3C43',
            wordBreak: 'break-all',
          }}>
            {isSudo ? '# ' : '$ '}{String(msg.toolInput?.cmd)}
          </div>
        )}
        {isRepair && Boolean(msg.toolInput?.action) && (
          <div style={{ padding: '4px 12px', fontSize: 11, color: '#636366' }}>
            动作：<code style={{ background: '#F2F2F7', padding: '1px 5px', borderRadius: 3 }}>{String(msg.toolInput?.action)}</code>
          </div>
        )}
        <div style={{ padding: '8px 12px', display: 'flex', gap: 6 }}>
          <button
            onClick={onApprove}
            style={{ flex: 1, padding: '7px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: accentColor, color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            {approveLabel}
          </button>
          <button
            onClick={onDeny}
            style={{ flex: 1, padding: '7px', borderRadius: 7, fontSize: 12, background: 'rgba(60,60,67,0.08)', color: '#636366', border: 'none', cursor: 'pointer' }}
          >
            拒绝
          </button>
        </div>
      </div>
    )
  }

  if (msg.role === 'tool_result') {
    const approved = msg.approved ?? false
    return (
      <div style={{ margin: '2px 0 6px' }}>
        <div style={{
          background: approved ? 'rgba(52,199,89,0.06)' : 'rgba(255,59,48,0.04)',
          border: `0.5px solid ${approved ? 'rgba(52,199,89,0.2)' : 'rgba(255,59,48,0.15)'}`,
          borderRadius: 8,
          padding: '5px 10px',
          fontSize: 10,
          color: approved ? '#34C759' : '#FF3B30',
          fontWeight: 600,
        }}>
          {approved ? '✓ 已执行' : '✕ 已拒绝'}
          {msg.resultText && msg.resultText !== '用户已拒绝' && (
            <span style={{ fontWeight: 400, color: '#636366', marginLeft: 8 }}>
              {msg.resultText.slice(0, 60)}{msg.resultText.length > 60 ? '...' : ''}
            </span>
          )}
        </div>
      </div>
    )
  }

  return null
}

function ThinkingDots() {
  return (
    <>
      <style>{`@keyframes rep-dot{0%,80%,100%{opacity:.25}40%{opacity:1}}`}</style>
      {[0, 150, 300].map(d => (
        <div key={d} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: '#AEAEB2',
          animation: `rep-dot 1.2s ${d}ms ease-in-out infinite`,
        }} />
      ))}
    </>
  )
}
