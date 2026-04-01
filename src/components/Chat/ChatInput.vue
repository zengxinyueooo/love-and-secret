<template>
  <div class="border-t border-gray-200 bg-white p-3 md:p-4">
    <div class="flex space-x-2 md:space-x-3">
      <textarea
        ref="textareaRef"
        v-model="inputMessage"
        @keydown.enter.exact.prevent="handleSend"
        placeholder="和黎深说些什么吧..."
        rows="1"
        class="flex-1 input-field resize-none text-base"
        :disabled="disabled"
      />
      <button
        @click="handleSend"
        :disabled="disabled || !inputMessage.trim()"
        class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed px-4 md:px-6 flex-shrink-0"
      >
        {{ disabled ? '...' : '发送' }}
      </button>
    </div>
    <div class="hidden md:block text-xs text-gray-500 mt-2">
      按 Enter 发送，Shift + Enter 换行
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, watch } from 'vue'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: [message: string]
}>()

const inputMessage = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// 页面加载时自动聚焦
onMounted(() => {
  nextTick(() => {
    textareaRef.value?.focus()
  })
})

// 监听disabled状态，当从禁用变为启用时自动聚焦
watch(() => props.disabled, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    // 从禁用变为启用，自动聚焦
    nextTick(() => {
      textareaRef.value?.focus()
    })
  }
})

const handleSend = () => {
  if (!inputMessage.value.trim() || props.disabled) return

  emit('send', inputMessage.value.trim())
  inputMessage.value = ''

  // 发送后自动聚焦到输入框
  nextTick(() => {
    textareaRef.value?.focus()
  })
}
</script>
