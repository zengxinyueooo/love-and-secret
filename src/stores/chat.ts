import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Message } from '../types'
import { backend, type ConversationDTO, type MessageDTO } from '../utils/backend'

function dtoToMessage(dto: MessageDTO): Message {
  return {
    id: dto.id,
    content: dto.content,
    role: dto.role === 'assistant' ? 'assistant' : 'user',
    timestamp: new Date(dto.createdAt).getTime()
  }
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Message[]>([])
  const isLoading = ref(false)
  // 多会话状态
  const conversations = ref<ConversationDTO[]>([])
  const activeConversationId = ref<string | null>(null)
  const backendOnline = ref(false)
  const syncing = ref(false)

  // ---------- 本地降级模式（后端不可用时） ----------
  const saveMessages = () => {
    localStorage.setItem('chat_messages', JSON.stringify(messages.value))
  }

  const loadMessages = () => {
    const saved = localStorage.getItem('chat_messages')
    if (saved) {
      messages.value = JSON.parse(saved)
    }
  }

  // ---------- 初始化 ----------
  const init = async () => {
    try {
      conversations.value = await backend.listConversations()
      backendOnline.value = true
    } catch {
      backendOnline.value = false
      loadMessages()
      return
    }

    // 首次接入后端：把旧的 localStorage 聊天记录导入成一个会话，不弄丢历史
    const legacy = localStorage.getItem('chat_messages')
    if (legacy && conversations.value.length === 0) {
      try {
        const parsed: Message[] = JSON.parse(legacy)
        if (parsed.length > 0) {
          await importLegacyMessages(parsed)
          localStorage.removeItem('chat_messages')
        }
      } catch {
        // 导入失败不阻塞，旧数据留在 localStorage
      }
    }

    // 恢复上次活跃会话
    const savedId = localStorage.getItem('active_conversation')
    if (savedId && conversations.value.some((c) => c.id === savedId)) {
      activeConversationId.value = savedId
    } else if (conversations.value.length > 0) {
      activeConversationId.value = conversations.value[0].id
    }

    if (activeConversationId.value) {
      await loadActiveMessages()
    } else {
      messages.value = []
    }
  }

  const importLegacyMessages = async (legacy: Message[]) => {
    const conv = await backend.createConversation({
      title: `导入的历史对话（${legacy.length}条）`
    })
    for (const m of legacy) {
      await backend.createMessage(conv.id, { role: m.role, content: m.content })
    }
    conversations.value = await backend.listConversations()
  }

  const loadActiveMessages = async () => {
    if (!backendOnline.value || !activeConversationId.value) return
    try {
      const dtos = await backend.listMessages(activeConversationId.value)
      messages.value = dtos.map(dtoToMessage)
    } catch {
      // 单次加载失败不算离线，保留现有内容
    }
  }

  // ---------- 会话管理 ----------
  const createConversation = async (title?: string) => {
    if (!backendOnline.value) return null
    const conv = await backend.createConversation({ title })
    conversations.value.unshift(conv)
    activeConversationId.value = conv.id
    localStorage.setItem('active_conversation', conv.id)
    messages.value = []
    return conv
  }

  const switchConversation = async (id: string) => {
    activeConversationId.value = id
    localStorage.setItem('active_conversation', id)
    messages.value = []
    await loadActiveMessages()
  }

  const deleteConversation = async (id: string) => {
    if (!backendOnline.value) return
    await backend.deleteConversation(id)
    conversations.value = conversations.value.filter((c) => c.id !== id)
    if (activeConversationId.value === id) {
      activeConversationId.value = conversations.value[0]?.id ?? null
      if (activeConversationId.value) {
        await loadActiveMessages()
      } else {
        messages.value = []
      }
    }
  }

  /** 发送前确保有活跃会话（懒创建，避免一堆空白会话）。systemPrompt 为 M2 人设层，落到服务端 */
  const ensureConversation = async (firstMessage: string, systemPrompt?: string) => {
    if (!backendOnline.value) return
    if (!activeConversationId.value) {
      const title = firstMessage.slice(0, 24) + (firstMessage.length > 24 ? '…' : '')
      const conv = await backend.createConversation({
        title: title || '新的对话',
        systemPrompt,
      })
      conversations.value.unshift(conv)
      activeConversationId.value = conv.id
      localStorage.setItem('active_conversation', conv.id)
    }
  }

  // ---------- 消息写入 ----------
  // 添加消息（本地即时 + 后端异步持久化），返回消息id
  // persist=false：后端 chat 端点模式下由服务端统一落库，前端只做本地展示
  const addMessage = (
    content: string,
    role: 'user' | 'assistant',
    persist = true,
  ): string => {
    const message: Message = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      role,
      timestamp: Date.now()
    }
    messages.value.push(message)

    if (persist && backendOnline.value && activeConversationId.value) {
      // 后端写入失败不阻断聊天，静默降级
      backend
        .createMessage(activeConversationId.value, { role, content })
        .catch(() => {
          console.warn('后端消息写入失败，本次会话转为本地模式')
          backendOnline.value = false
        })
    } else if (!backendOnline.value) {
      saveMessages()
    }
    return message.id
  }

  // 流式输出期间的占位与追加（只在本地累积，完成后由 commitLastMessage 一次性持久化）
  const beginAssistantMessage = () => {
    messages.value.push({
      id: `local-${Date.now()}`,
      content: '',
      role: 'assistant',
      timestamp: Date.now()
    })
  }

  const appendToLastMessage = (text: string) => {
    if (messages.value.length === 0) return
    const last = messages.value[messages.value.length - 1]
    last.content += text
    // 本地降级模式下节流保存
    if (!backendOnline.value) {
      scheduleLocalSave()
    }
  }

  let localSaveTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleLocalSave = () => {
    if (localSaveTimer) return
    localSaveTimer = setTimeout(() => {
      localSaveTimer = null
      saveMessages()
    }, 500)
  }

  /** 流式结束后持久化最后一条助手消息（persist=false：服务端 chat 端点已落库） */
  const commitLastMessage = (persist = true) => {
    const last = messages.value[messages.value.length - 1]
    if (!last || last.role !== 'assistant') return
    if (persist && backendOnline.value && activeConversationId.value) {
      backend
        .createMessage(activeConversationId.value, {
          role: 'assistant',
          content: last.content
        })
        .catch(() => {
          console.warn('助手消息持久化失败')
          backendOnline.value = false
          saveMessages()
        })
    } else if (!backendOnline.value) {
      saveMessages()
    }
  }

  // 清空当前对话（后端模式=删除当前会话；本地模式=清空存储）
  const clearMessages = () => {
    if (backendOnline.value && activeConversationId.value) {
      const id = activeConversationId.value
      activeConversationId.value = null
      backend
        .deleteConversation(id)
        .then(() => {
          conversations.value = conversations.value.filter((c) => c.id !== id)
        })
        .catch(() => {})
    } else {
      localStorage.removeItem('chat_messages')
    }
    messages.value = []
  }

  return {
    messages,
    isLoading,
    conversations,
    activeConversationId,
    backendOnline,
    syncing,
    init,
    loadMessages,
    addMessage,
    beginAssistantMessage,
    appendToLastMessage,
    commitLastMessage,
    createConversation,
    switchConversation,
    deleteConversation,
    ensureConversation,
    clearMessages
  }
})
