/**
 * 后端 API 客户端（Node/Hono 服务）
 * M2 起记忆系统、LLM Gateway 都经由这里访问
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api'

export interface ConversationDTO {
  id: string
  title: string
  personaId: string | null
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

  createConversation: (body?: { title?: string; personaId?: string }) =>
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
}
