<template>
  <div class="h-[calc(100vh-64px)] flex flex-col relative overflow-hidden bg-white">
    <!-- 用户自定义背景图片 -->
    <div
      v-if="settingsStore.settings.backgroundConfig.chatBackground"
      class="absolute inset-0 bg-cover bg-center bg-no-repeat"
      :style="{
        backgroundImage: `url(${settingsStore.settings.backgroundConfig.chatBackground})`,
        opacity: settingsStore.settings.backgroundConfig.chatBackgroundOpacity
      }"
    />

    <!-- 内容区域 -->
    <div class="relative z-10 h-full flex flex-col bg-transparent">
      <!-- 会话切换栏（后端在线时显示） -->
      <div
        v-if="chatStore.backendOnline"
        class="px-3 py-2 md:px-6 flex items-center gap-2 border-b border-gray-100/80 bg-white/60 backdrop-blur-sm"
      >
        <select
          :value="chatStore.activeConversationId ?? ''"
          @change="handleSwitchConversation"
          class="flex-1 min-w-0 max-w-xs text-sm text-gray-700 bg-transparent border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary truncate"
        >
          <option value="" disabled>选择对话…</option>
          <option v-for="c in chatStore.conversations" :key="c.id" :value="c.id">
            {{ c.title }}
          </option>
        </select>
        <button
          @click="handleNewConversation"
          class="text-sm text-gray-500 hover:text-primary transition-colors whitespace-nowrap"
          title="开始新对话"
        >
          ✚ 新对话
        </button>
        <span
          v-if="!chatStore.activeConversationId"
          class="text-xs text-gray-400"
        >尚未创建对话，发送第一条消息即开始</span>
      </div>

      <!-- 后端离线提示 -->
      <div
        v-else
        class="px-3 py-1.5 md:px-6 text-xs text-amber-600 bg-amber-50 border-b border-amber-100"
      >
        ⚠️ 后端服务未连接（localhost:8787），当前为本地存储模式，仅保留最近对话
      </div>

      <!-- 消息列表区域 -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-4">
      <div v-if="chatStore.messages.length === 0" class="h-full flex items-center justify-center">
        <div class="text-center">
          <div class="text-6xl mb-4">❄️</div>
          <h2 class="text-2xl font-bold text-gray-700 mb-2">与黎深的对话</h2>
          <p class="text-gray-500">开始和黎深聊天吧~</p>
        </div>
      </div>

      <div
        v-for="message in chatStore.messages"
        :key="message.id"
        class="relative"
      >
        <MessageBubble :message="message" />
        <MagicDust v-if="message.role === 'assistant'" :trigger="message.id === lastMessageId" />
      </div>

      <!-- 加载中指示器：仅在等待第一个chunk时显示 -->
      <div v-if="isWaiting" class="flex justify-start mb-4">
        <div class="flex-shrink-0 mr-3">
          <img
            v-if="settingsStore.settings.avatarConfig.assistantAvatar"
            :src="settingsStore.settings.avatarConfig.assistantAvatar"
            class="w-10 h-10 rounded-full object-cover"
          />
          <div v-else class="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white text-xl">
            ❄️
          </div>
        </div>
        <div class="bg-white px-4 py-3 rounded-lg shadow-md border border-gray-200">
          <div class="flex space-x-2">
            <div class="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
            <div class="w-2 h-2 bg-primary rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
            <div class="w-2 h-2 bg-primary rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
          </div>
        </div>
      </div>
      </div>

      <!-- 清空对话和更换背景按钮 -->
      <div class="px-6 py-2 flex justify-between items-center">
        <button
          v-if="chatStore.messages.length > 0"
          @click="handleClearChat"
          class="text-sm text-gray-500 hover:text-red-500 transition-colors"
        >
          🗑️ 清空对话
        </button>
        <button
          @click="showUploadModal = true"
          class="text-sm text-gray-500 hover:text-primary transition-colors ml-auto"
        >
          🖼️ 更换背景
        </button>
      </div>

      <!-- 输入区域 -->
      <ChatInput :disabled="chatStore.isLoading" @send="handleSendMessage" />
    </div>

    <!-- 上传背景图片弹窗 -->
    <UploadBackgroundModal
      v-model="showUploadModal"
      type="chat"
      @upload="handleUploadBackground"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch, computed } from 'vue'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import MessageBubble from '../components/Chat/MessageBubble.vue'
import ChatInput from '../components/Chat/ChatInput.vue'
import UploadBackgroundModal from '../components/Common/UploadBackgroundModal.vue'
import MagicDust from '../components/Chat/MagicDust.vue'
import { sendChatMessageStream } from '../utils/api'
import { streamChat, resolveLLMTarget } from '../utils/backend'

const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const messagesContainer = ref<HTMLElement | null>(null)
const showUploadModal = ref(false)
// 仅在等待第一个chunk时为true，收到内容后立即变false
const isWaiting = ref(false)

// 获取最后一条消息的ID，用于触发特效
const lastMessageId = computed(() => {
  const messages = chatStore.messages
  return messages.length > 0 ? messages[messages.length - 1].id : ''
})

onMounted(async () => {
  await chatStore.init()
  settingsStore.loadSettings()
  scrollToBottom()
})

// 监听消息变化,自动滚动到底部
watch(
  () => chatStore.messages.length,
  () => {
    nextTick(() => {
      scrollToBottom()
    })
  }
)

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const handleSendMessage = async (message: string) => {
  // 检查API配置
  if (!settingsStore.settings.apiConfig.apiKey) {
    chatStore.addMessage('请先在设置页面配置API Key', 'assistant')
    return
  }

  // M2：后端在线 + 供应商兼容 OpenAI 协议 → 走服务端（七层 Context 装配 + 落库 + 流式返回）
  const target = resolveLLMTarget(
    settingsStore.settings.apiConfig.model,
    settingsStore.settings.apiConfig.baseUrl,
  )
  if (chatStore.backendOnline && target) {
    await sendViaBackend(message, target)
    return
  }

  await sendViaDirect(message)
}

/** 服务端路径：Context 装配、LLM 调用、消息持久化全部在服务端完成 */
const sendViaBackend = async (message: string, target: { baseUrl: string; model: string }) => {
  await chatStore.ensureConversation(message, settingsStore.buildSystemPrompt())
  if (!chatStore.activeConversationId) {
    chatStore.addMessage('会话创建失败，请稍后重试', 'assistant')
    return
  }
  // 用户消息本地展示（服务端 chat 端点会落库，前端不再重复持久化）
  chatStore.addMessage(message, 'user', false)

  chatStore.isLoading = true
  isWaiting.value = true
  chatStore.beginAssistantMessage()

  try {
    await streamChat(
      chatStore.activeConversationId,
      message,
      { apiKey: settingsStore.settings.apiConfig.apiKey, target },
      (text) => {
        if (isWaiting.value) isWaiting.value = false
        chatStore.appendToLastMessage(text)
        nextTick(() => scrollToBottom())
      },
    )
    // 服务端已持久化，前端无需 commit
  } catch (error: any) {
    console.error('服务端聊天失败:', error)
    const last = chatStore.messages[chatStore.messages.length - 1]
    if (last?.role === 'assistant') {
      if (!last.content) last.content = `抱歉，发生了错误: ${error.message || '未知错误'}`
      else last.content += `\n\n(发生错误: ${error.message || '未知错误'})`
    } else {
      chatStore.addMessage(`抱歉，发生了错误: ${error.message || '未知错误'}`, 'assistant', false)
    }
  } finally {
    chatStore.isLoading = false
    isWaiting.value = false
  }
}

/** 直连降级路径：后端离线或供应商协议不兼容（claude/wenxin）时走浏览器直调 LLM */
const sendViaDirect = async (message: string) => {
  await chatStore.ensureConversation(message, settingsStore.buildSystemPrompt())

  // 添加用户消息
  chatStore.addMessage(message, 'user')

  chatStore.isLoading = true
  isWaiting.value = true

  // 构建消息历史（发送前先取，避免包含占位消息）
  const historyMessages = chatStore.messages.slice(-10).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }))
  const systemPrompt = settingsStore.buildSystemPrompt()
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...historyMessages
  ]

  // 添加空的助手消息占位，用于流式填充
  chatStore.beginAssistantMessage()

  try {
    // 流式调用API，每个chunk追加到最后一条消息
    await sendChatMessageStream(
      settingsStore.settings.apiConfig.model,
      settingsStore.settings.apiConfig.apiKey,
      messages,
      (text) => {
        // 收到第一个chunk，隐藏等待动画
        if (isWaiting.value) isWaiting.value = false
        chatStore.appendToLastMessage(text)
        nextTick(() => scrollToBottom())
      },
      settingsStore.settings.apiConfig.baseUrl
    )
    // 流结束，持久化完整的助手消息
    chatStore.commitLastMessage()
  } catch (error: any) {
    console.error('发送消息失败:', error)
    const last = chatStore.messages[chatStore.messages.length - 1]
    if (last?.role === 'assistant') {
      if (!last.content) {
        last.content = `抱歉，发生了错误: ${error.message || '未知错误'}`
      } else {
        last.content += `\n\n(发生错误: ${error.message || '未知错误'})`
      }
    } else {
      chatStore.addMessage(`抱歉，发生了错误: ${error.message || '未知错误'}`, 'assistant')
    }
    chatStore.commitLastMessage()
  } finally {
    chatStore.isLoading = false
    isWaiting.value = false
  }
}

const handleSwitchConversation = (e: Event) => {
  const id = (e.target as HTMLSelectElement).value
  if (id && id !== chatStore.activeConversationId) {
    chatStore.switchConversation(id)
  }
}

const handleNewConversation = async () => {
  if (chatStore.isLoading) return
  if (
    chatStore.messages.length > 0 &&
    !confirm('开始新对话？当前对话会保留在列表中')
  ) {
    return
  }
  await chatStore.createConversation('新的对话')
}

const handleClearChat = () => {
  if (chatStore.backendOnline) {
    if (confirm('确定要删除当前对话吗？删除后无法恢复。')) {
      chatStore.clearMessages()
    }
  } else {
    if (confirm('确定要清空所有对话记录吗?')) {
      chatStore.clearMessages()
    }
  }
}

const handleUploadBackground = (imageData: string, opacity?: number) => {
  settingsStore.updateChatBackground(imageData || undefined)
  if (opacity !== undefined) {
    settingsStore.updateChatBackgroundOpacity(opacity)
  }
}
</script>

