import { useState, useRef, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool_pending' | 'tool_result'

export interface ChatMessage {
  id: string
  role: MessageRole
  // user / assistant / system
  text?: string
  // tool_pending
  toolUseId?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolReason?: string
  // tool_result
  approved?: boolean
  resultText?: string
}

interface PendingTool {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  displayMsgId: string
  priorResults: unknown[]
}

// ── Anthropic API types ────────────────────────────────────────────────────────

interface ClaudeTextBlock { type: 'text'; text: string }
interface ClaudeToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock

interface ClaudeMessage { role: 'user' | 'assistant'; content: string | ClaudeContentBlock[] }

interface ClaudeToolResult {
  type: 'tool_result'
  tool_use_id: string
  content: string
}

interface ClaudeResponse {
  stop_reason: 'end_turn' | 'tool_use' | string
  content: ClaudeContentBlock[]
}

// ── OpenAI-compatible API types ────────────────────────────────────────────────

interface OAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface OAIAssistantMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: OAIToolCall[]
}

interface OAIToolMessage {
  role: 'tool'
  content: string
  tool_call_id: string
}

type OAIMessage =
  | { role: 'user' | 'system'; content: string }
  | OAIAssistantMessage
  | OAIToolMessage

interface OAIResponse {
  choices: Array<{
    message: OAIAssistantMessage
    finish_reason: string
  }>
}

// ── Tool definitions ───────────────────────────────────────────────────────────

const AUTO_TOOLS = new Set(['get_system_info', 'get_openclaw_status', 'get_config', 'read_gateway_log'])

const TOOLS = [
  {
    name: 'get_system_info',
    description: '获取系统环境信息（OS、Node.js版本、npm版本、磁盘空间等）',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_openclaw_status',
    description: '获取 OpenClaw 安装状态和 Gateway 运行状态',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_config',
    description: '获取 OpenClaw 配置快照（模型、Telegram 设置，不含敏感 Key）',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_gateway_log',
    description: '读取 Gateway 最新运行日志',
    input_schema: {
      type: 'object',
      properties: {
        lines: { type: 'number', description: '读取最新行数，默认 50' },
      },
      required: [],
    },
  },
  {
    name: 'restart_gateway',
    description: '重启 Gateway 服务（需要用户授权）',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'run_repair',
    description: '执行内置修复动作（需要用户授权）',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['doctor', 'gateway_reinstall', 'sessions_cleanup'],
          description: 'doctor=运行诊断, gateway_reinstall=重装网关服务, sessions_cleanup=清理会话',
        },
        reason: { type: 'string', description: '向用户解释为什么要执行此操作' },
      },
      required: ['action', 'reason'],
    },
  },
  {
    name: 'run_shell',
    description: '执行受限的系统诊断命令（需要用户授权）。允许的程序：npm, node, which, ls, cat, launchctl, systemctl, openclaw, echo, npx, ps, lsof, brew, top, df, du, whoami, hostname, uname, sw_vers, ifconfig, netstat, curl, ping, head, tail, grep, find, wc, sort, mkdir, cp, mv, rm, touch, chmod, chown',
    input_schema: {
      type: 'object',
      properties: {
        cmd: { type: 'string', description: '要执行的命令（不支持管道/分号/重定向）' },
        reason: { type: 'string', description: '向用户解释为什么要执行此命令' },
      },
      required: ['cmd', 'reason'],
    },
  },
  {
    name: 'run_sudo_shell',
    description: '以管理员/root 权限执行命令（需要用户授权并输入系统密码）。仅在普通权限无法解决问题时使用。允许的程序：chown, chmod, npm, kill, killall, rm, mkdir, mv, cp, ln, launchctl, systemctl, brew, lsof, netstat。macOS 会弹出系统密码对话框，Linux 使用 pkexec。',
    input_schema: {
      type: 'object',
      properties: {
        cmd: { type: 'string', description: '要以管理员权限执行的命令（不支持管道/分号/重定向，无需写 sudo 前缀）' },
        reason: { type: 'string', description: '向用户解释为什么需要管理员权限' },
      },
      required: ['cmd', 'reason'],
    },
  },
]

// OpenAI-compatible tool format
const OAI_TOOLS = TOOLS.map(t => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}))

// ── Hook options ──────────────────────────────────────────────────────────────

export interface UseAgentOptions {
  model?: string
  maxTokens?: number
  systemPromptOverride?: string
  provider?: 'anthropic' | 'openai_compat'
  baseUrl?: string
  storageKey?: string
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是 OpenClaw 安装器的内置 AI 诊断助手。
OpenClaw 是一个基于 Node.js 的 AI Gateway，通过这个桌面安装器管理。

你的职责：
1. 帮用户诊断和解决 OpenClaw 安装、配置、运行中遇到的复杂问题
2. 优先使用只读工具收集信息，再决定是否需要执行修复操作
3. 执行任何写操作前，务必通过工具调用让用户明确授权
4. 用清晰、简洁的中文解释问题和解决方案

常见问题场景：
- Node.js / npm 未检测到或版本不对
- Gateway 服务无法启动或频繁崩溃
- LaunchAgent (macOS) / systemd (Linux) 配置问题
- API Key 配置错误
- 网络/代理问题（中国大陆用户 Telegram 连接失败属正常现象）
- npm 包安装权限问题

注意事项：
- [telegram] 类日志中的网络错误在中国大陆属正常现象，不需要修复
- [memory] fts unavailable 是 SQLite 功能缺失，通常无需处理
- 每次调用工具后，分析结果再决定下一步`

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function getToolLabel(name: string): string {
  const labels: Record<string, string> = {
    get_system_info: '系统信息',
    get_openclaw_status: 'OpenClaw 状态',
    get_config: '配置信息',
    read_gateway_log: 'Gateway 日志',
    restart_gateway: '重启 Gateway',
    run_repair: '执行修复',
    run_shell: 'Shell 命令',
    run_sudo_shell: '管理员命令',
  }
  return labels[name] ?? name
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'get_system_info': {
        const info = await invoke<Record<string, unknown>>('get_system_info')
        return JSON.stringify(info, null, 2)
      }
      case 'get_openclaw_status': {
        const status = await invoke<Record<string, unknown>>('get_openclaw_status')
        return JSON.stringify(status, null, 2)
      }
      case 'get_config': {
        const config = await invoke<Record<string, unknown>>('load_config')
        return JSON.stringify(config, null, 2)
      }
      case 'read_gateway_log': {
        const lines = typeof input.lines === 'number' ? input.lines : 50
        const logs = await invoke<Array<{ line: string }>>('read_logs', { lines })
        return logs.map(l => l.line).join('\n') || '(日志为空)'
      }
      case 'restart_gateway': {
        await invoke('restart_gateway')
        return '已成功重启 Gateway 服务'
      }
      case 'run_repair': {
        const action = input.action as string
        const cmdMap: Record<string, string> = {
          doctor: 'run_doctor',
          gateway_reinstall: 'run_gateway_reinstall',
          sessions_cleanup: 'run_sessions_cleanup',
        }
        const cmd = cmdMap[action]
        if (!cmd) return `未知修复动作: ${action}`
        await invoke(cmd)
        return `已开始执行修复动作: ${action}（详细日志请查看「诊断修复」页面）`
      }
      case 'run_shell': {
        const cmd = input.cmd as string
        return await invoke<string>('execute_agent_shell', { cmd })
      }
      case 'run_sudo_shell': {
        const cmd = input.cmd as string
        return await invoke<string>('execute_agent_sudo_shell', { cmd })
      }
      default:
        return `未知工具: ${name}`
    }
  } catch (e) {
    return `错误: ${e instanceof Error ? e.message : String(e)}`
  }
}

// ── SSE stream parser helpers ────────────────────────────────────────────────

async function readSSELines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      onLine(line)
    }
  }
  if (buffer.trim()) onLine(buffer)
}

// ── Session persistence helpers ──────────────────────────────────────────────

const MAX_PERSISTED_MESSAGES = 50

interface PersistedSession {
  messages: ChatMessage[]
  claudeHistory: ClaudeMessage[]
  openaiHistory: OAIMessage[]
}

function loadSession(key: string): PersistedSession | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as PersistedSession
  } catch {
    return null
  }
}

function saveSession(key: string, data: PersistedSession) {
  try {
    const trimmed: PersistedSession = {
      messages: data.messages.slice(-MAX_PERSISTED_MESSAGES),
      claudeHistory: data.claudeHistory.slice(-MAX_PERSISTED_MESSAGES),
      openaiHistory: data.openaiHistory.slice(-MAX_PERSISTED_MESSAGES),
    }
    localStorage.setItem(key, JSON.stringify(trimmed))
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAgent(opts?: UseAgentOptions) {
  // Restore from localStorage if storageKey provided
  const storageKey = opts?.storageKey
  const restored = storageKey ? loadSession(storageKey) : null

  const [messages, setMessages] = useState<ChatMessage[]>(restored?.messages ?? [])
  const [isLoading, setIsLoading] = useState(false)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [pendingTool, setPendingTool] = useState<PendingTool | null>(null)

  const claudeHistory = useRef<ClaudeMessage[]>(restored?.claudeHistory ?? [])
  const openaiHistory = useRef<OAIMessage[]>(restored?.openaiHistory ?? [])
  const apiKeyRef = useRef<string | null>(null)
  const modelRef = useRef(opts?.model ?? 'claude-sonnet-4-6')
  const maxTokensRef = useRef(opts?.maxTokens ?? 4096)
  const systemPromptRef = useRef(opts?.systemPromptOverride ?? SYSTEM_PROMPT)
  const providerRef = useRef<'anthropic' | 'openai_compat'>(opts?.provider ?? 'anthropic')
  const baseUrlRef = useRef(opts?.baseUrl ?? '')

  // Persist session on messages change (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    if (!storageKey) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveSession(storageKey, {
        messages: messagesRef.current,
        claudeHistory: claudeHistory.current,
        openaiHistory: openaiHistory.current,
      })
    }, 500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [messages, storageKey])

  // Update refs when opts change (e.g. after async config load)
  useEffect(() => {
    if (opts?.model !== undefined) modelRef.current = opts.model
    if (opts?.maxTokens !== undefined) maxTokensRef.current = opts.maxTokens
    if (opts?.systemPromptOverride !== undefined) systemPromptRef.current = opts.systemPromptOverride
    if (opts?.provider !== undefined) providerRef.current = opts.provider
    if (opts?.baseUrl !== undefined) baseUrlRef.current = opts.baseUrl
  }, [opts?.model, opts?.maxTokens, opts?.systemPromptOverride, opts?.provider, opts?.baseUrl])

  // ── Load API key ──────────────────────────────────────────────────────────

  const loadApiKey = useCallback(async () => {
    const isTauri = Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__)
    if (!isTauri) {
      const devKey = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY ?? null
      apiKeyRef.current = devKey
      setApiKey(devKey)
      if (!devKey) setApiKeyError('开发模式：设置 VITE_ANTHROPIC_API_KEY 环境变量以测试')
      return
    }
    try {
      const key = await invoke<string>('get_agent_api_key')
      apiKeyRef.current = key
      setApiKey(key)
      setApiKeyError(null)
    } catch (e) {
      setApiKeyError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // ── Append display message ────────────────────────────────────────────────

  function addMsg(msg: Omit<ChatMessage, 'id'>): string {
    const id = uid()
    setMessages(prev => [...prev, { ...msg, id }])
    return id
  }

  function updateMsg(id: string, patch: Partial<ChatMessage>) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  }

  // ── Anthropic: streaming API call ─────────────────────────────────────────

  async function streamClaude(
    history: ClaudeMessage[],
    onTextDelta: (accumulated: string) => void,
  ): Promise<ClaudeResponse> {
    const key = apiKeyRef.current
    if (!key) throw new Error('未配置 API Key')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelRef.current,
        max_tokens: maxTokensRef.current,
        system: systemPromptRef.current,
        tools: TOOLS,
        messages: history,
        stream: true,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`API 错误 ${res.status}: ${err}`)
    }

    // Parse SSE stream
    const content: ClaudeContentBlock[] = []
    let stopReason = 'end_turn'
    let currentTextIdx = -1
    let currentToolIdx = -1
    let toolJsonBuf = ''
    let accumulatedText = ''

    const reader = res.body!.getReader()
    await readSSELines(reader, (line) => {
      if (!line.startsWith('data: ')) return
      const data = line.slice(6).trim()
      if (data === '[DONE]') return

      let evt: any
      try { evt = JSON.parse(data) } catch { return }

      switch (evt.type) {
        case 'content_block_start': {
          const block = evt.content_block
          if (block?.type === 'text') {
            content.push({ type: 'text', text: '' })
            currentTextIdx = content.length - 1
            currentToolIdx = -1
          } else if (block?.type === 'tool_use') {
            content.push({ type: 'tool_use', id: block.id, name: block.name, input: {} })
            currentToolIdx = content.length - 1
            currentTextIdx = -1
            toolJsonBuf = ''
          }
          break
        }
        case 'content_block_delta': {
          const delta = evt.delta
          if (delta?.type === 'text_delta' && currentTextIdx >= 0) {
            const tb = content[currentTextIdx] as ClaudeTextBlock
            tb.text += delta.text
            accumulatedText += delta.text
            onTextDelta(accumulatedText)
          } else if (delta?.type === 'input_json_delta' && currentToolIdx >= 0) {
            toolJsonBuf += delta.partial_json ?? ''
          }
          break
        }
        case 'content_block_stop': {
          if (currentToolIdx >= 0 && toolJsonBuf) {
            try {
              (content[currentToolIdx] as ClaudeToolUseBlock).input = JSON.parse(toolJsonBuf)
            } catch {
              // malformed tool JSON — leave empty
            }
          }
          currentTextIdx = -1
          currentToolIdx = -1
          toolJsonBuf = ''
          break
        }
        case 'message_delta': {
          if (evt.delta?.stop_reason) {
            stopReason = evt.delta.stop_reason
          }
          break
        }
      }
    })

    return { stop_reason: stopReason, content }
  }

  // ── OpenAI-compatible: streaming API call ─────────────────────────────────

  async function streamOpenAI(
    history: OAIMessage[],
    onTextDelta: (accumulated: string) => void,
  ): Promise<OAIResponse> {
    const key = apiKeyRef.current
    if (!key) throw new Error('未配置 API Key')

    const model = modelRef.current.trim()
    if (!model) throw new Error('未配置模型名称，请在「AI 助手配置」中填写（例如 kimi-k2.5）')

    const baseUrl = baseUrlRef.current.replace(/\/$/, '')
    if (!baseUrl) throw new Error('未配置 API Base URL，请在「AI 助手配置」中填写')

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokensRef.current,
        tools: OAI_TOOLS,
        messages: [
          { role: 'system', content: systemPromptRef.current },
          ...history,
        ],
        stream: true,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`API 错误 ${res.status}: ${err}`)
    }

    // Parse SSE stream
    let assistantContent = ''
    const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map()
    let finishReason = 'stop'

    const reader = res.body!.getReader()
    await readSSELines(reader, (line) => {
      if (!line.startsWith('data: ')) return
      const data = line.slice(6).trim()
      if (data === '[DONE]') return

      let chunk: any
      try { chunk = JSON.parse(data) } catch { return }

      const delta = chunk.choices?.[0]?.delta
      const reason = chunk.choices?.[0]?.finish_reason
      if (reason) finishReason = reason

      if (!delta) return

      if (delta.content) {
        assistantContent += delta.content
        onTextDelta(assistantContent)
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0
          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '' })
          }
          const existing = toolCalls.get(idx)!
          if (tc.id) existing.id = tc.id
          if (tc.function?.name) existing.name = tc.function.name
          if (tc.function?.arguments) existing.arguments += tc.function.arguments
        }
      }
    })

    // Reconstruct OAIResponse
    const message: OAIAssistantMessage = {
      role: 'assistant',
      content: assistantContent || null,
    }
    if (toolCalls.size > 0) {
      message.tool_calls = Array.from(toolCalls.values()).map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      }))
    }

    return {
      choices: [{ message, finish_reason: finishReason }],
    }
  }

  // ── Anthropic agent loop ──────────────────────────────────────────────────

  async function runLoop(history: ClaudeMessage[], priorResults: ClaudeToolResult[] = []) {
    setIsLoading(true)

    let currentHistory = history
    if (priorResults.length > 0) {
      currentHistory = [...history, { role: 'user', content: priorResults as any }]
      claudeHistory.current = currentHistory
    }

    try {
      // Create a streaming assistant message placeholder
      const streamMsgId = uid()
      setMessages(prev => [...prev, { id: streamMsgId, role: 'assistant', text: '' }])

      const resp = await streamClaude(currentHistory, (accumulated) => {
        setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, text: accumulated } : m))
      })

      claudeHistory.current = [...currentHistory, { role: 'assistant', content: resp.content }]

      // Finalize the streaming message with complete text
      const textParts = resp.content.filter(b => b.type === 'text').map(b => (b as ClaudeTextBlock).text).join('\n').trim()
      if (textParts) {
        setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, text: textParts } : m))
      } else {
        // Remove empty placeholder
        setMessages(prev => prev.filter(m => m.id !== streamMsgId))
      }

      if (resp.stop_reason !== 'tool_use') {
        setIsLoading(false)
        return
      }

      const toolUses = resp.content.filter(b => b.type === 'tool_use') as ClaudeToolUseBlock[]
      const autoResults: ClaudeToolResult[] = []

      for (const toolUse of toolUses) {
        if (AUTO_TOOLS.has(toolUse.name)) {
          addMsg({ role: 'system', text: `正在读取 ${getToolLabel(toolUse.name)}...` })
          const result = await executeTool(toolUse.name, toolUse.input)
          autoResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result })
        } else {
          const displayMsgId = addMsg({
            role: 'tool_pending',
            toolUseId: toolUse.id,
            toolName: toolUse.name,
            toolInput: toolUse.input,
            toolReason: (toolUse.input.reason as string) ?? '',
          })
          setPendingTool({
            toolUseId: toolUse.id,
            toolName: toolUse.name,
            toolInput: toolUse.input,
            displayMsgId,
            priorResults: autoResults,
          })
          setIsLoading(false)
          return
        }
      }

      const nextHistory: ClaudeMessage[] = [
        ...claudeHistory.current,
        { role: 'user', content: autoResults as any },
      ]
      claudeHistory.current = nextHistory
      await runLoop(nextHistory)

    } catch (e) {
      addMsg({ role: 'system', text: `出错了：${e instanceof Error ? e.message : String(e)}` })
      setIsLoading(false)
    }
  }

  // ── OpenAI-compatible agent loop ──────────────────────────────────────────

  async function runLoopOpenAI(history: OAIMessage[], priorResults: OAIToolMessage[] = []) {
    setIsLoading(true)

    let currentHistory = history
    if (priorResults.length > 0) {
      currentHistory = [...history, ...priorResults]
      openaiHistory.current = currentHistory
    }

    try {
      // Create a streaming assistant message placeholder
      const streamMsgId = uid()
      setMessages(prev => [...prev, { id: streamMsgId, role: 'assistant', text: '' }])

      const resp = await streamOpenAI(currentHistory, (accumulated) => {
        setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, text: accumulated } : m))
      })

      const choice = resp.choices?.[0]
      if (!choice) throw new Error('API 返回空响应')

      const msg = choice.message
      openaiHistory.current = [...currentHistory, msg]

      // Finalize the streaming message
      if (msg.content) {
        setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, text: msg.content! } : m))
      } else {
        setMessages(prev => prev.filter(m => m.id !== streamMsgId))
      }

      if (choice.finish_reason !== 'tool_calls' || !msg.tool_calls?.length) {
        setIsLoading(false)
        return
      }

      const autoResults: OAIToolMessage[] = []

      for (const toolCall of msg.tool_calls) {
        const name = toolCall.function.name
        let input: Record<string, unknown> = {}
        try { input = JSON.parse(toolCall.function.arguments) } catch {}

        if (AUTO_TOOLS.has(name)) {
          addMsg({ role: 'system', text: `正在读取 ${getToolLabel(name)}...` })
          const result = await executeTool(name, input)
          autoResults.push({ role: 'tool', content: result, tool_call_id: toolCall.id })
        } else {
          const displayMsgId = addMsg({
            role: 'tool_pending',
            toolUseId: toolCall.id,
            toolName: name,
            toolInput: input,
            toolReason: (input.reason as string) ?? '',
          })
          setPendingTool({
            toolUseId: toolCall.id,
            toolName: name,
            toolInput: input,
            displayMsgId,
            priorResults: autoResults,
          })
          setIsLoading(false)
          return
        }
      }

      const nextHistory = [...openaiHistory.current, ...autoResults]
      openaiHistory.current = nextHistory
      await runLoopOpenAI(nextHistory)

    } catch (e) {
      addMsg({ role: 'system', text: `出错了：${e instanceof Error ? e.message : String(e)}` })
      setIsLoading(false)
    }
  }

  // ── Public: send user message ─────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (isLoading || pendingTool) return

    addMsg({ role: 'user', text })

    if (providerRef.current === 'openai_compat') {
      openaiHistory.current = [...openaiHistory.current, { role: 'user', content: text }]
      await runLoopOpenAI(openaiHistory.current)
    } else {
      claudeHistory.current = [...claudeHistory.current, { role: 'user', content: text }]
      await runLoop(claudeHistory.current)
    }
  }, [isLoading, pendingTool])

  // ── Public: approve / deny pending tool ───────────────────────────────────

  const approveTool = useCallback(async () => {
    if (!pendingTool) return
    const { toolUseId, toolName, toolInput, displayMsgId, priorResults } = pendingTool
    setPendingTool(null)

    updateMsg(displayMsgId, { role: 'tool_result', approved: true, resultText: '正在执行...' })
    setIsLoading(true)

    const result = await executeTool(toolName, toolInput)
    updateMsg(displayMsgId, { resultText: result })

    if (providerRef.current === 'openai_compat') {
      const allResults: OAIToolMessage[] = [
        ...(priorResults as OAIToolMessage[]),
        { role: 'tool', content: result, tool_call_id: toolUseId },
      ]
      await runLoopOpenAI(openaiHistory.current, allResults)
    } else {
      const allResults: ClaudeToolResult[] = [
        ...(priorResults as ClaudeToolResult[]),
        { type: 'tool_result', tool_use_id: toolUseId, content: result },
      ]
      await runLoop(claudeHistory.current, allResults)
    }
  }, [pendingTool])

  const denyTool = useCallback(() => {
    if (!pendingTool) return
    const { toolUseId, displayMsgId, priorResults } = pendingTool
    setPendingTool(null)

    updateMsg(displayMsgId, { role: 'tool_result', approved: false, resultText: '用户已拒绝' })

    if (providerRef.current === 'openai_compat') {
      const allResults: OAIToolMessage[] = [
        ...(priorResults as OAIToolMessage[]),
        { role: 'tool', content: '用户拒绝了此操作', tool_call_id: toolUseId },
      ]
      runLoopOpenAI(openaiHistory.current, allResults)
    } else {
      const allResults: ClaudeToolResult[] = [
        ...(priorResults as ClaudeToolResult[]),
        { type: 'tool_result', tool_use_id: toolUseId, content: '用户拒绝了此操作' },
      ]
      runLoop(claudeHistory.current, allResults)
    }
  }, [pendingTool])

  // ── Public: reset conversation ────────────────────────────────────────────

  const resetConversation = useCallback(() => {
    claudeHistory.current = []
    openaiHistory.current = []
    setMessages([])
    setPendingTool(null)
    setIsLoading(false)
    if (storageKey) {
      try { localStorage.removeItem(storageKey) } catch {}
    }
  }, [storageKey])

  return {
    messages,
    isLoading,
    apiKey,
    apiKeyError,
    pendingTool,
    loadApiKey,
    sendMessage,
    approveTool,
    denyTool,
    resetConversation,
    getToolLabel,
  }
}
