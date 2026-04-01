<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="close"
    >
      <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto fade-in">
        <div class="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <h2 class="text-2xl font-bold text-gray-800">添加新卡面</h2>
          <button @click="close" class="text-gray-500 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        <div class="p-6">
          <form @submit.prevent="handleSubmit">
            <!-- 标题 -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                卡面标题 <span class="text-red-500">*</span>
              </label>
              <input
                v-model="formData.title"
                type="text"
                class="input-field"
                placeholder="例如: 雪中相遇"
                required
              />
            </div>

            <!-- 图片URL -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                图片URL <span class="text-red-500">*</span>
              </label>
              <input
                v-model="formData.imageUrl"
                type="url"
                class="input-field"
                placeholder="https://example.com/image.jpg"
                required
              />
              <p class="text-xs text-gray-500 mt-1">
                支持图片直链,建议使用图床上传后获取链接
              </p>
            </div>

            <!-- 图片预览 -->
            <div v-if="formData.imageUrl" class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                图片预览
              </label>
              <div class="aspect-[2/3] max-w-xs bg-gray-200 rounded-lg overflow-hidden">
                <img
                  :src="formData.imageUrl"
                  alt="预览"
                  class="w-full h-full object-cover"
                  @error="imageError = true"
                />
              </div>
              <p v-if="imageError" class="text-xs text-red-500 mt-1">
                图片加载失败,请检查URL是否正确
              </p>
            </div>

            <!-- 语录 -->
            <div class="mb-6">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                卡面语录 <span class="text-red-500">*</span>
              </label>
              <textarea
                v-model="formData.quote"
                rows="6"
                class="input-field resize-none"
                placeholder="输入卡面中的经典语录..."
                required
              />
            </div>

            <!-- 按钮 -->
            <div class="flex justify-end space-x-3">
              <button type="button" @click="close" class="btn-secondary">
                取消
              </button>
              <button type="submit" class="btn-primary">
                添加
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Card } from '../../types'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  add: [card: Omit<Card, 'id' | 'collectedDate'>]
}>()

const formData = ref({
  title: '',
  imageUrl: '',
  quote: ''
})

const imageError = ref(false)

// 监听图片URL变化,重置错误状态
watch(
  () => formData.value.imageUrl,
  () => {
    imageError.value = false
  }
)

const close = () => {
  emit('update:modelValue', false)
  // 重置表单
  setTimeout(() => {
    formData.value = {
      title: '',
      imageUrl: '',
      quote: ''
    }
    imageError.value = false
  }, 300)
}

const handleSubmit = () => {
  if (imageError.value) {
    alert('图片加载失败,请检查URL')
    return
  }

  emit('add', {
    title: formData.value.title,
    imageUrl: formData.value.imageUrl,
    quote: formData.value.quote
  })

  close()
}
</script>
