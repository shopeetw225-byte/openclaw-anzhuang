import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import { useAgent } from '../hooks/useAgent'
import type { ChatMessage } from '../hooks/useAgent'

export default function Agent() {
  const navigate = useNavigate()
  const [agentOpts, setAgentOpts] = useState<{
    model: string
    maxTokens: number
    provider: 'anthropic' | 'openai_compat'
    baseUrl: string
  } | undefined>()

  useEffect(() => {
    const isTauri = Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__)
    if (!isTauri) return
    invoke<{ provider: string; base_url: string; model: string; max_tokens: number }>('get_agent_config')
      .then(c => setAgentOpts({
        model: c.model,
        maxTokens: c.max_tokens,
        provider: c.provider === 'openai_compat' ? 'openai_compat' : 'anthropic',
        baseUrl: c.base_url ?? '',
      }))
      .catch(() => {})
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
  } = useAgent(agentOpts ? { ...agentOpts, storageKey: 'openclaw-agent-chat' } : { storageKey: 'openclaw-agent-chat' })

  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    loadApiKey()
  }, [loadApiKey])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

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
          onClick={() => navigate('/dashboard', { replace: true })}
          style={{ background: 'none', border: 'none', color: '#007AFF', fontSize: 13, cursor: 'pointer', padding: 0 }}
        >
          ← 返回
        </button>
        <span style={{ fontSize: 17, fontWeight: 600, color: '#000' }}>AI 诊断助手</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate('/agent-repair')}
            style={{ background: 'none', border: 'none', color: '#007AFF', fontSize: 13, cursor: 'pointer', padding: 0 }}
          >
            修复模式
          </button>
          <button
            onClick={() => navigate('/agent-config')}
            style={{ background: 'none', border: 'none', color: '#636366', fontSize: 13, cursor: 'pointer', padding: 0 }}
          >
            ⚙ 设置
          </button>
          <button
            onClick={resetConversation}
            style={{ background: 'none', border: 'none', color: '#636366', fontSize: 13, cursor: 'pointer', padding: 0 }}
          >
            重置
          </button>
        </div>
      </div>

      {/* API Key error banner */}
      {apiKeyError && (
        <div style={{
          margin: '12px 16px 0',
          padding: '10px 14px',
          background: 'rgba(255,59,48,0.06)',
          border: '1px solid rgba(255,59,48,0.2)',
          borderRadius: 10,
          fontSize: 13,
          color: '#FF3B30',
          lineHeight: 1.5,
        }}>
          ⚠️ {apiKeyError}
          <br />
          <span style={{ fontSize: 12, color: '#636366', marginTop: 4, display: 'block' }}>
                请前往「修改配置」填写 Anthropic API Key，或
                <button
                  onClick={() => navigate('/agent-config')}
                  style={{ background: 'none', border: 'none', color: '#007AFF', fontSize: 12, cursor: 'pointer', padding: '0 2px' }}
                >
                  配置 AI 助手
                </button>
              </span>
        </div>
      )}

      {/* Welcome banner when empty */}
      {messages.length === 0 && !apiKeyError && (
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{
            background: '#fff',
            borderRadius: 14,
            padding: '20px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🤖</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#000', marginBottom: 6 }}>
              你好，我是 OpenClaw 诊断助手
            </div>
            <div style={{ fontSize: 13, color: '#636366', lineHeight: 1.6 }}>
              我可以帮你诊断并解决安装、配置和运行中遇到的复杂问题。
              描述你遇到的情况，我会自动读取系统状态，必要时请求你授权后执行修复操作。
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                'Gateway 无法启动',
                'npm 安装失败',
                '帮我检查系统状态',
                'API Key 配置问题',
              ].map(hint => (
                <button
                  key={hint}
                  onClick={() => { setInput(hint); textareaRef.current?.focus() }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    color: '#007AFF',
                    background: 'rgba(0,122,255,0.08)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} onApprove={approveTool} onDeny={denyTool} getToolLabel={getToolLabel} />
        ))}

        {/* Thinking indicator */}
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
            <div style={{
              background: '#fff',
              borderRadius: '16px 16px 16px 4px',
              padding: '10px 14px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              display: 'flex',
              gap: 4,
              alignItems: 'center',
            }}>
              <ThinkingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        borderTop: '0.5px solid rgba(60,60,67,0.15)',
        background: 'rgba(242,242,247,0.95)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        padding: '10px 16px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-end',
        flexShrink: 0,
      }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={pendingTool ? '请先处理上面的授权请求...' : '描述你遇到的问题... (Enter 发送)'}
          disabled={!!pendingTool}
          rows={1}
          style={{
            flex: 1,
            background: '#fff',
            border: '0.5px solid rgba(60,60,67,0.2)',
            borderRadius: 20,
            padding: '9px 14px',
            fontSize: 14,
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            maxHeight: 120,
            overflowY: 'auto',
            color: '#000',
            opacity: pendingTool ? 0.5 : 1,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading || !!pendingTool || !!apiKeyError}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: (!input.trim() || isLoading || !!pendingTool || !!apiKeyError) ? 'rgba(60,60,67,0.12)' : '#007AFF',
            border: 'none',
            cursor: (!input.trim() || isLoading || !!pendingTool || !!apiKeyError) ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            color: '#fff',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          ↑
        </button>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MessageBubble({
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div style={{
          maxWidth: '75%',
          background: '#007AFF',
          color: '#fff',
          borderRadius: '18px 18px 4px 18px',
          padding: '10px 14px',
          fontSize: 14,
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
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
        <div style={{
          maxWidth: '80%',
          background: '#fff',
          color: '#000',
          borderRadius: '18px 18px 18px 4px',
          padding: '10px 14px',
          fontSize: 14,
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
      <div style={{
        textAlign: 'center',
        fontSize: 11,
        color: '#AEAEB2',
        margin: '4px 0 8px',
        letterSpacing: 0.2,
      }}>
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
    const accentBg = isSudo ? 'rgba(255,59,48,0.08)' : 'rgba(255,149,0,0.08)'
    const accentBorder = isSudo ? 'rgba(255,59,48,0.35)' : 'rgba(255,149,0,0.35)'
    const accentDivider = isSudo ? 'rgba(255,59,48,0.2)' : 'rgba(255,149,0,0.2)'
    const headerIcon = isSudo ? '🔴' : '🔐'
    const headerLabel = isSudo ? '需要管理员权限' : '授权请求'
    const approveLabel = isSudo ? '授权执行（需输入系统密码）' : '授权执行'

    return (
      <div style={{
        margin: '6px 0 10px',
        background: '#fff',
        borderRadius: 14,
        border: `1px solid ${accentBorder}`,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        {/* Header */}
        <div style={{
          background: accentBg,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: `0.5px solid ${accentDivider}`,
        }}>
          <span style={{ fontSize: 16 }}>{headerIcon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: accentColor }}>{headerLabel}</span>
          <span style={{ fontSize: 12, color: '#636366', marginLeft: 'auto' }}>
            {getToolLabel(toolName)}
          </span>
        </div>

        {/* Reason */}
        {msg.toolReason && (
          <div style={{ padding: '10px 14px 4px', fontSize: 13, color: '#3C3C43', lineHeight: 1.5 }}>
            {msg.toolReason}
          </div>
        )}

        {/* Sudo warning */}
        {isSudo && (
          <div style={{
            margin: '6px 14px 2px',
            padding: '7px 10px',
            background: 'rgba(255,59,48,0.06)',
            borderRadius: 8,
            fontSize: 12,
            color: '#FF3B30',
          }}>
            ⚠️ 点击授权后将弹出系统密码输入框
          </div>
        )}

        {/* Command preview */}
        {(isShell || isSudo) && Boolean(msg.toolInput?.cmd) && (
          <div style={{
            margin: '8px 14px',
            padding: '8px 10px',
            background: '#F2F2F7',
            borderRadius: 8,
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: 12,
            color: '#3C3C43',
            wordBreak: 'break-all',
          }}>
            {isSudo ? '# ' : '$ '}{String(msg.toolInput?.cmd)}
          </div>
        )}

        {/* Repair action */}
        {isRepair && Boolean(msg.toolInput?.action) && (
          <div style={{ padding: '6px 14px 2px', fontSize: 12, color: '#636366' }}>
            动作：<code style={{ background: '#F2F2F7', padding: '1px 6px', borderRadius: 4 }}>
              {String(msg.toolInput?.action)}
            </code>
          </div>
        )}

        {/* Buttons */}
        <div style={{ padding: '10px 14px', display: 'flex', gap: 8 }}>
          <button
            onClick={onApprove}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: accentColor,
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {approveLabel}
          </button>
          <button
            onClick={onDeny}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 8,
              fontSize: 13,
              background: 'rgba(60,60,67,0.08)',
              color: '#636366',
              border: 'none',
              cursor: 'pointer',
            }}
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
      <div style={{ margin: '4px 0 10px' }}>
        <div style={{
          background: '#fff',
          borderRadius: 12,
          border: `0.5px solid ${approved ? 'rgba(52,199,89,0.3)' : 'rgba(255,59,48,0.25)'}`,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            padding: '7px 12px',
            background: approved ? 'rgba(52,199,89,0.06)' : 'rgba(255,59,48,0.04)',
            borderBottom: `0.5px solid ${approved ? 'rgba(52,199,89,0.15)' : 'rgba(255,59,48,0.12)'}`,
            fontSize: 11,
            color: approved ? '#34C759' : '#FF3B30',
            fontWeight: 600,
            letterSpacing: 0.3,
          }}>
            {approved ? '✓ 已执行' : '✕ 已拒绝'}
          </div>
          {msg.resultText && msg.resultText !== '用户已拒绝' && (
            <div style={{
              padding: '8px 12px',
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              fontSize: 11,
              color: '#3C3C43',
              lineHeight: 1.6,
              maxHeight: 180,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {msg.resultText}
            </div>
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
      <style>{`
        @keyframes agent-dot { 0%,80%,100%{opacity:.25}40%{opacity:1} }
      `}</style>
      {[0, 150, 300].map(delay => (
        <div
          key={delay}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#AEAEB2',
            animation: `agent-dot 1.2s ${delay}ms ease-in-out infinite`,
          }}
        />
      ))}
    </>
  )
}
