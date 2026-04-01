import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Message } from '../types'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Message[]>([])
  const isLoading = ref(false)

  // 从localStorage加载消息
  const loadMessages = () => {
    const saved = localStorage.getItem('chat_messages')
    if (saved) {
      messages.value = JSON.parse(saved)
    }
  }

  // 保存消息到localStorage
  const saveMessages = () => {
    localStorage.setItem('chat_messages', JSON.stringify(messages.value))
  }

  // 添加消息，返回消息id
  const addMessage = (content: string, role: 'user' | 'assistant'): string => {
    const id = Date.now().toString()
    const message: Message = {
      id,
      content,
      role,
      timestamp: Date.now()
    }
    messages.value.push(message)
    saveMessages()
    return id
  }

  // 追加内容到最后一条消息（用于流式输出）
  const appendToLastMessage = (text: string) => {
    if (messages.value.length === 0) return
    const last = messages.value[messages.value.length - 1]
    last.content += text
    saveMessages()
  }

  // 清空消息
  const clearMessages = () => {
    messages.value = []
    localStorage.removeItem('chat_messages')
  }

  return {
    messages,
    isLoading,
    loadMessages,
    addMessage,
    appendToLastMessage,
    clearMessages
  }
})
