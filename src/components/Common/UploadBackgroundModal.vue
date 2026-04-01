<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="close"
    >
      <div class="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto fade-in">
        <div class="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <h2 class="text-2xl font-bold text-gray-800">
            {{ type === 'home' ? '更换主页背景' : '更换聊天背景' }}
          </h2>
          <button @click="close" class="text-gray-500 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        <div class="p-6">
          <!-- 方式选择 -->
          <div class="mb-6">
            <div class="flex space-x-4 mb-4">
              <button
                @click="uploadMethod = 'file'"
                class="flex-1 py-2 px-4 rounded-lg transition-colors"
                :class="uploadMethod === 'file' ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700'"
              >
                📁 上传本地图片
              </button>
              <button
                @click="uploadMethod = 'url'"
                class="flex-1 py-2 px-4 rounded-lg transition-colors"
                :class="uploadMethod === 'url' ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700'"
              >
                🔗 使用图片URL
              </button>
            </div>
          </div>

          <!-- 本地上传 -->
          <div v-if="uploadMethod === 'file'" class="mb-6">
            <div
              class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              @click="triggerFileInput"
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleFileDrop"
              :class="{ 'border-primary bg-primary-light': isDragging }"
            >
              <input
                ref="fileInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleFileSelect"
              />
              <div class="text-6xl mb-4">📸</div>
              <p class="text-gray-600 mb-2">点击或拖拽图片到这里</p>
              <p class="text-sm text-gray-500">支持 JPG、PNG、GIF 等格式</p>
            </div>
          </div>

          <!-- URL输入 -->
          <div v-if="uploadMethod === 'url'" class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              图片URL
            </label>
            <input
              v-model="imageUrl"
              type="url"
              class="input-field"
              placeholder="https://example.com/image.jpg"
            />
          </div>

          <!-- 预览 -->
          <div v-if="previewImage" class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              预览
            </label>
            <div class="relative rounded-lg overflow-hidden bg-gray-200" style="height: 300px;">
              <img
                :src="previewImage"
                alt="预览"
                class="w-full h-full object-cover"
              />
            </div>
          </div>

          <!-- 透明度调节（仅聊天背景） -->
          <div v-if="type === 'chat' && previewImage" class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              背景透明度: {{ Math.round(opacity * 100) }}%
            </label>
            <input
              v-model.number="opacity"
              type="range"
              min="0.1"
              max="0.9"
              step="0.1"
              class="w-full"
            />
            <div class="flex justify-between text-xs text-gray-500 mt-1">
              <span>更透明</span>
              <span>更不透明</span>
            </div>
          </div>

          <!-- 按钮 -->
          <div class="flex justify-end space-x-3">
            <button
              v-if="previewImage"
              @click="handleClear"
              class="btn-secondary"
            >
              清除背景
            </button>
            <button @click="close" class="btn-secondary">
              取消
            </button>
            <button
              v-if="previewImage"
              @click="handleConfirm"
              class="btn-primary"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSettingsStore } from '../../stores/settings'

const props = defineProps<{
  modelValue: boolean
  type: 'home' | 'chat'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  upload: [imageData: string, opacity?: number]
}>()

const settingsStore = useSettingsStore()

const uploadMethod = ref<'file' | 'url'>('file')
const fileInput = ref<HTMLInputElement | null>(null)
const imageUrl = ref('')
const previewImage = ref('')
const isDragging = ref(false)
const opacity = ref(0.3)

// 监听URL变化
watch(imageUrl, (newUrl) => {
  if (newUrl && uploadMethod.value === 'url') {
    previewImage.value = newUrl
  }
})

// 加载现有背景
watch(() => props.modelValue, (show) => {
  if (show) {
    const existingBg = props.type === 'home'
      ? settingsStore.settings.backgroundConfig.homeBackground
      : settingsStore.settings.backgroundConfig.chatBackground

    if (existingBg) {
      previewImage.value = existingBg
      if (props.type === 'chat') {
        opacity.value = settingsStore.settings.backgroundConfig.chatBackgroundOpacity
      }
    }
  }
})

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    readFile(file)
  }
}

const handleFileDrop = (event: DragEvent) => {
  isDragging.value = false
  const file = event.dataTransfer?.files[0]
  if (file && file.type.startsWith('image/')) {
    readFile(file)
  }
}

const readFile = (file: File) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    previewImage.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

const handleConfirm = () => {
  if (previewImage.value) {
    if (props.type === 'chat') {
      emit('upload', previewImage.value, opacity.value)
    } else {
      emit('upload', previewImage.value)
    }
    close()
  }
}

const handleClear = () => {
  emit('upload', '')
  previewImage.value = ''
  imageUrl.value = ''
  close()
}

const close = () => {
  emit('update:modelValue', false)
  setTimeout(() => {
    previewImage.value = ''
    imageUrl.value = ''
    uploadMethod.value = 'file'
  }, 300)
}
</script>
