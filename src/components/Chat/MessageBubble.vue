<template>
  <div
    class="flex mb-6 message-enter"
    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
  >
    <!-- 助手头像 -->
    <div v-if="message.role === 'assistant'" class="flex-shrink-0 mr-3">
      <div class="avatar-container">
        <img
          v-if="settingsStore.settings.avatarConfig.assistantAvatar"
          :src="settingsStore.settings.avatarConfig.assistantAvatar"
          class="w-12 h-12 rounded-full object-cover shadow-lg avatar-pulse"
        />
        <div v-else class="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white text-2xl shadow-lg avatar-pulse">
          ❄️
        </div>
      </div>
    </div>

    <!-- 消息内容 -->
    <div
      class="message-bubble"
      :class="message.role === 'user' ? 'user-bubble' : 'assistant-bubble'"
    >
      <p class="whitespace-pre-wrap break-words message-text">{{ message.content }}</p>
      <div
        class="text-xs mt-2 opacity-60"
        :class="message.role === 'user' ? 'text-right' : 'text-left'"
      >
        {{ formatDate(message.timestamp, 'HH:mm') }}
      </div>
    </div>

    <!-- 用户头像 -->
    <div v-if="message.role === 'user'" class="flex-shrink-0 ml-3">
      <img
        v-if="settingsStore.settings.avatarConfig.userAvatar"
        :src="settingsStore.settings.avatarConfig.userAvatar"
        class="w-12 h-12 rounded-full object-cover shadow-lg"
      />
      <div v-else class="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-rose-400 flex items-center justify-center text-white text-2xl shadow-lg">
        🌸
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatDate } from '../../utils/date'
import { useSettingsStore } from '../../stores/settings'
import type { Message } from '../../types'

defineProps<{
  message: Message
}>()

const settingsStore = useSettingsStore()
</script>

<style scoped>
/* 消息进场动画 */
@keyframes messageEnter {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.message-enter {
  animation: messageEnter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 头像脉冲动画 */
@keyframes avatarPulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(74, 144, 226, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(74, 144, 226, 0);
  }
}

.avatar-pulse {
  animation: avatarPulse 2s ease-in-out infinite;
}

/* 消息气泡基础样式 */
.message-bubble {
  max-width: 85%;
  padding: 0.875rem 1rem;
  border-radius: 1.25rem;
  position: relative;
  backdrop-filter: blur(10px);
}

@media (min-width: 768px) {
  .message-bubble {
    max-width: 70%;
    padding: 1rem 1.25rem;
  }
}

/* 助手消息气泡 - 温柔感 */
.assistant-bubble {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(232, 244, 248, 0.95) 100%);
  border: 1.5px solid rgba(74, 144, 226, 0.2);
  box-shadow:
    0 4px 20px rgba(74, 144, 226, 0.15),
    0 0 30px rgba(74, 144, 226, 0.05);
  border-radius: 1.25rem 1.25rem 1.25rem 0.25rem;
}

.assistant-bubble::before {
  content: '';
  position: absolute;
  left: -8px;
  bottom: 8px;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 8px 8px 0;
  border-color: transparent rgba(255, 255, 255, 0.95) transparent transparent;
}

/* 用户消息气泡 - 手写感 */
.user-bubble {
  background: linear-gradient(135deg, #4A90E2 0%, #5BA3E8 100%);
  color: white;
  box-shadow:
    0 4px 15px rgba(74, 144, 226, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  border-radius: 1.25rem 1.25rem 0.25rem 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.user-bubble::before {
  content: '';
  position: absolute;
  right: -8px;
  bottom: 8px;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 0 8px 8px;
  border-color: transparent transparent #5BA3E8 transparent;
}

/* 文字呼吸感动画 */
.message-text {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 0.95rem;
  line-height: 1.6;
  letter-spacing: 0.3px;
}

.assistant-bubble .message-text {
  color: #2c3e50;
  font-weight: 400;
}

/* 悬停效果 */
.message-bubble:hover {
  transform: translateY(-2px);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.assistant-bubble:hover {
  box-shadow:
    0 6px 25px rgba(74, 144, 226, 0.2),
    0 0 40px rgba(74, 144, 226, 0.08);
}

.user-bubble:hover {
  box-shadow:
    0 6px 20px rgba(74, 144, 226, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
</style>
