/**
 * 后端 API 客户端（Node/Hono 服务）
 * M2 起记忆系统、LLM Gateway 都经由这里访问
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api'

export interface ConversationDTO {
  id: string
  title: string
  personaId: string | null
  systemPrompt: string | null
  turnCount: number
  createdAt: string
  updatedAt: string
}

export interface MessageDTO {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  turnIndex: number
  meta: Record<string, unknown> | null
  createdAt: string
}

/** M3-M5 记忆 DTO（与后端 memories 表字段对齐；embedding 不返回避免大 payload） */
export interface MemoryDTO {
  id: string
  conversationId: string | null
  kind: 'fact' | 'episode' | 'emotion' | 'event'
  content: string
  summary: string | null
  sourceMessageIds: string[]
  importance: number
  confidence: number
  gate: 'auto' | 'review'
  status: 'active' | 'pending_review' | 'rejected' | 'superseded'
  validFrom: string
  validTo: string | null
  supersededBy: string | null
  accessCount: number
  lastAccessedAt: string | null
  // M5
  valence: number | null
  arousal: number | null
  emotionalIntensity: number
  emotionalDimension: 'intimacy' | 'trust' | 'conflict' | 'arousal' | null
  createdAt: string
  updatedAt: string
}

export interface ChapterDTO {
  id: string
  conversationId: string
  chapterIndex: number
  startTurn: number
  endTurn: number
  summary: string
  messageIds: string[]
  createdAt: string
}

export interface RelationshipStateDTO {
  conversationId: string
  intimacy: number
  trust: number
  conflict: number
  phase: 'initial' | 'warming' | 'intimate' | 'conflicted' | 'distant'
  version: number
  lastEventAt: string | null
  updatedAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
    ...init,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`后端错误 ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

export const backend = {
  health: () => request<{ ok: boolean }>('/../health'),

  listConversations: () => request<ConversationDTO[]>('/conversations'),

  createConversation: (body?: { title?: string; personaId?: string; systemPrompt?: string }) =>
    request<ConversationDTO>('/conversations', {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  updateConversation: (id: string, body: { title?: string; personaId?: string }) =>
    request<ConversationDTO>(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteConversation: (id: string) =>
    request<{ ok: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),

  listMessages: (conversationId: string) =>
    request<MessageDTO[]>(`/conversations/${conversationId}/messages`),

  createMessage: (
    conversationId: string,
    body: { role: 'user' | 'assistant'; content: string },
  ) =>
    request<MessageDTO>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // -------------------------------------------------------------------------
  // M7：记忆面板 + 数据导出
  // -------------------------------------------------------------------------

  /** 列出记忆（可按 conversationId / status / kind 过滤） */
  listMemories: (params?: {
    conversationId?: string
    status?: MemoryDTO['status']
    kind?: MemoryDTO['kind']
  }) => {
    const q = new URLSearchParams()
    if (params?.conversationId) q.set('conversationId', params.conversationId)
    if (params?.status) q.set('status', params.status)
    if (params?.kind) q.set('kind', params.kind)
    const qs = q.toString()
    return request<MemoryDTO[]>(`/memories${qs ? `?${qs}` : ''}`)
  },

  /** Write Gate：approve / reject / edit */
  updateMemory: (
    id: string,
    body: { action: 'approve' | 'reject' | 'edit'; content?: string },
  ) =>
    request<MemoryDTO>(`/memories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteMemory: (id: string) =>
    request<{ ok: boolean }>(`/memories/${id}`, { method: 'DELETE' }),

  /** 数据导出：JSON / Markdown */
  exportConversation: async (
    conversationId: string,
    format: 'json' | 'markdown',
  ): Promise<{ filename: string; blob: Blob }> => {
    const res = await fetch(`${BASE_URL}/conversations/${conversationId}/export?format=${format}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`导出失败 ${res.status}: ${body.slice(0, 200)}`)
    }
    const disposition = res.headers.get('content-disposition') || ''
    const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
    const filename = filenameMatch
      ? decodeURIComponent(filenameMatch[1])
      : `conversation-${conversationId}.${format === 'markdown' ? 'md' : 'json'}`
    const blob = await res.blob()
    return { filename, blob }
  },
}

// ---------------------------------------------------------------------------
// M2：服务端聊天（Context 装配 + LLM Gateway 都在后端完成）
// ---------------------------------------------------------------------------

import type { AIModel } from '../types'

/** OpenAI 兼容供应商 → 实际请求地址与模型 id（claude/wenxin 协议不兼容，走前端直连降级） */
const OPENAI_COMPATIBLE: Partial<Record<AIModel, { baseUrl: string; model: string }>> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-3.5-turbo' },
  qianwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4' },
}

export interface LLMTarget {
  baseUrl: string
  model: string
}

/** 解析用户选择的供应商是否可走后端网关 */
export function resolveLLMTarget(provider: AIModel, baseUrlOverride?: string): LLMTarget | null {
  const target = OPENAI_COMPATIBLE[provider]
  if (!target) return null
  return { baseUrl: baseUrlOverride || target.baseUrl, model: target.model }
}

export interface ChatStreamResult {
  userMessageId: string
  assistantMessageId: string
  injectedLayers: string[]
}

/**
 * 服务端聊天：POST SSE 流。
 * 服务端负责：存用户消息 → 七层 Context 装配 → LLM 流式调用 → 存助手消息（含 trace）
 */
export async function streamChat(
  conversationId: string,
  content: string,
  llm: { apiKey: string; target: LLMTarget },
  onDelta: (text: string) => void,
): Promise<ChatStreamResult> {
  const res = await fetch(`${BASE_URL}/conversations/${conversationId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey}`,
      'X-LLM-Base-URL': llm.target.baseUrl,
      'X-LLM-Model': llm.target.model,
    },
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(180_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`后端错误 ${res.status}: ${text.slice(0, 200)}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('无法读取响应流')

  const decoder = new TextDecoder()
  let buffer = ''
  let result: ChatStreamResult | null = null
  let streamError: string | null = null

  const handleEvent = (event: string, data: string) => {
    if (event === 'delta') {
      const parsed = JSON.parse(data) as { text: string }
      if (parsed.text) onDelta(parsed.text)
    } else if (event === 'done') {
      const parsed = JSON.parse(data) as ChatStreamResult
      result = parsed
    } else if (event === 'error') {
      streamError = (JSON.parse(data) as { message: string }).message
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // SSE 事件以空行分隔
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() || ''
    for (const block of blocks) {
      let event = 'message'
      const dataLines: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length) handleEvent(event, dataLines.join('\n'))
    }
  }

  if (streamError) throw new Error(streamError)
  if (!result) throw new Error('聊天流异常结束（未收到 done 事件）')
  return result
}
