<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="close"
    >
      <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto fade-in">
        <div class="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <h2 class="text-2xl font-bold text-gray-800">添加新回忆</h2>
          <button @click="close" class="text-gray-500 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        <div class="p-6">
          <form @submit.prevent="handleSubmit">
            <!-- 日期 -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                日期 <span class="text-red-500">*</span>
              </label>
              <input
                v-model="formData.date"
                type="date"
                class="input-field"
                required
              />
            </div>

            <!-- 标题 -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                标题 <span class="text-red-500">*</span>
              </label>
              <input
                v-model="formData.title"
                type="text"
                class="input-field"
                placeholder="例如: 初次相遇"
                required
              />
            </div>

            <!-- 描述 -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                描述 <span class="text-red-500">*</span>
              </label>
              <textarea
                v-model="formData.description"
                rows="6"
                class="input-field resize-none"
                placeholder="记录这段美好的回忆..."
                required
              />
            </div>

            <!-- 图片URL(可选) -->
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                图片URL (可选)
              </label>
              <input
                v-model="formData.imageUrl"
                type="url"
                class="input-field"
                placeholder="https://example.com/image.jpg"
              />
            </div>

            <!-- 图片预览 -->
            <div v-if="formData.imageUrl" class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">
                图片预览
              </label>
              <div class="max-w-md bg-gray-200 rounded-lg overflow-hidden">
                <img
                  :src="formData.imageUrl"
                  alt="预览"
                  class="w-full h-auto object-cover"
                />
              </div>
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
import { ref } from 'vue'
import type { Memory } from '../../types'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  add: [memory: Omit<Memory, 'id'>]
}>()

const formData = ref({
  date: new Date().toISOString().split('T')[0],
  title: '',
  description: '',
  imageUrl: ''
})

const close = () => {
  emit('update:modelValue', false)
  // 重置表单
  setTimeout(() => {
    formData.value = {
      date: new Date().toISOString().split('T')[0],
      title: '',
      description: '',
      imageUrl: ''
    }
  }, 300)
}

const handleSubmit = () => {
  emit('add', {
    date: new Date(formData.value.date).getTime(),
    title: formData.value.title,
    description: formData.value.description,
    imageUrl: formData.value.imageUrl || undefined
  })

  close()
}
</script>
