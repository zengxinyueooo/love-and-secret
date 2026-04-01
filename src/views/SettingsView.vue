<template>
  <div class="min-h-[calc(100vh-64px)] bg-bg-main p-6">
    <div class="container mx-auto max-w-4xl">
      <h1 class="text-3xl font-bold text-gray-800 mb-8">⚙️ 设置</h1>

      <!-- API配置 -->
      <div class="card p-6 mb-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">API配置</h2>

        <!-- 模型选择 -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            AI模型 <span class="text-red-500">*</span>
          </label>
          <select v-model="apiConfig.model" class="input-field">
            <option value="openai">OpenAI GPT</option>
            <option value="claude">Claude (Anthropic)</option>
            <option value="deepseek">DeepSeek</option>
            <option value="qianwen">通义千问</option>
            <option value="wenxin">文心一言</option>
            <option value="zhipu">智谱AI</option>
          </select>
        </div>

        <!-- API Key -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            API Key <span class="text-red-500">*</span>
          </label>
          <input
            v-model="apiConfig.apiKey"
            type="password"
            class="input-field"
            placeholder="输入你的API Key"
          />
          <p class="text-xs text-gray-500 mt-1">
            API Key将保存在本地浏览器中,不会上传到服务器
          </p>
        </div>

        <!-- 自定义Base URL -->
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            自定义Base URL (可选)
          </label>
          <input
            v-model="apiConfig.baseUrl"
            type="url"
            class="input-field"
            placeholder="留空使用默认地址"
          />
        </div>

        <!-- 测试连接 -->
        <div class="flex space-x-3">
          <button @click="handleSaveAPI" class="btn-primary">
            保存配置
          </button>
          <button
            @click="handleTestConnection"
            :disabled="testing"
            class="btn-secondary disabled:opacity-50"
          >
            {{ testing ? '测试中...' : '测试连接' }}
          </button>
        </div>

        <!-- 测试结果 -->
        <div v-if="testResult" class="mt-4 p-3 rounded-lg" :class="testResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'">
          {{ testResult.message }}
        </div>
      </div>

      <!-- 系统提示词 -->
      <div class="card p-6 mb-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">系统提示词</h2>
        <p class="text-sm text-gray-600 mb-4">
          自定义黎深的人设和对话风格
        </p>

        <textarea
          v-model="systemPrompt"
          rows="12"
          class="input-field resize-none font-mono text-sm"
        />

        <div class="mt-4 flex space-x-3">
          <button @click="handleSavePrompt" class="btn-primary">
            保存提示词
          </button>
          <button @click="handleResetPrompt" class="btn-secondary">
            恢复默认
          </button>
        </div>
      </div>

      <!-- 界面设置 -->
      <div class="card p-6 mb-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">界面设置</h2>

        <div class="space-y-4">
          <!-- 雪花效果 -->
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium text-gray-800">雪花飘落效果</h3>
              <p class="text-sm text-gray-600">背景的雪花动画</p>
            </div>
            <button
              @click="settingsStore.toggleSnowflake()"
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              :class="settingsStore.settings.snowflakeEnabled ? 'bg-primary' : 'bg-gray-300'"
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                :class="settingsStore.settings.snowflakeEnabled ? 'translate-x-6' : 'translate-x-1'"
              />
            </button>
          </div>

          <!-- 背景音乐 -->
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-medium text-gray-800">背景音乐</h3>
              <p class="text-sm text-gray-600">播放背景音乐(暂未实现)</p>
            </div>
            <button
              @click="settingsStore.toggleBackgroundMusic()"
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              :class="settingsStore.settings.backgroundMusicEnabled ? 'bg-primary' : 'bg-gray-300'"
              disabled
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                :class="settingsStore.settings.backgroundMusicEnabled ? 'translate-x-6' : 'translate-x-1'"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- 头像设置 -->
      <div class="card p-6 mb-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">头像设置</h2>
        <div class="flex flex-wrap gap-8">
          <!-- 黎深头像 -->
          <div class="flex flex-col items-center gap-3">
            <p class="text-sm font-medium text-gray-700">黎深的头像</p>
            <div class="relative group cursor-pointer" @click="triggerAvatarUpload('assistant')">
              <img
                v-if="settingsStore.settings.avatarConfig.assistantAvatar"
                :src="settingsStore.settings.avatarConfig.assistantAvatar"
                class="w-20 h-20 rounded-full object-cover shadow-md"
              />
              <div v-else class="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white text-3xl shadow-md">
                ❄️
              </div>
              <div class="absolute inset-0 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-30 flex items-center justify-center transition-all">
                <span class="text-white text-xs opacity-0 group-hover:opacity-100">点击更换</span>
              </div>
            </div>
            <button
              v-if="settingsStore.settings.avatarConfig.assistantAvatar"
              @click="settingsStore.updateAssistantAvatar(undefined)"
              class="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              恢复默认
            </button>
          </div>

          <!-- 我的头像 -->
          <div class="flex flex-col items-center gap-3">
            <p class="text-sm font-medium text-gray-700">我的头像</p>
            <div class="relative group cursor-pointer" @click="triggerAvatarUpload('user')">
              <img
                v-if="settingsStore.settings.avatarConfig.userAvatar"
                :src="settingsStore.settings.avatarConfig.userAvatar"
                class="w-20 h-20 rounded-full object-cover shadow-md"
              />
              <div v-else class="w-20 h-20 rounded-full bg-gradient-to-br from-pink-400 to-rose-400 flex items-center justify-center text-white text-3xl shadow-md">
                🌸
              </div>
              <div class="absolute inset-0 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-30 flex items-center justify-center transition-all">
                <span class="text-white text-xs opacity-0 group-hover:opacity-100">点击更换</span>
              </div>
            </div>
            <button
              v-if="settingsStore.settings.avatarConfig.userAvatar"
              @click="settingsStore.updateUserAvatar(undefined)"
              class="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              恢复默认
            </button>
          </div>
        </div>
        <!-- 隐藏的文件输入 -->
        <input ref="avatarInput" type="file" accept="image/*" class="hidden" @change="handleAvatarUpload" />
      </div>

      <!-- 数据管理 -->
      <div class="card p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">数据管理</h2>

        <div class="space-y-3">
          <button @click="handleExportData" class="btn-secondary w-full">
            📥 导出所有数据
          </button>
          <button @click="handleImportData" class="btn-secondary w-full">
            📤 导入数据
          </button>
          <button @click="handleClearData" class="text-red-500 hover:text-red-700 w-full py-2">
            🗑️ 清空所有数据
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { testAPIConnection } from '../utils/api'
import type { AIModel } from '../types'

const settingsStore = useSettingsStore()

// 头像上传
const avatarInput = ref<HTMLInputElement | null>(null)
const currentAvatarTarget = ref<'assistant' | 'user'>('assistant')

const triggerAvatarUpload = (target: 'assistant' | 'user') => {
  currentAvatarTarget.value = target
  avatarInput.value?.click()
}

const handleAvatarUpload = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (event) => {
    const base64 = event.target?.result as string
    if (currentAvatarTarget.value === 'assistant') {
      settingsStore.updateAssistantAvatar(base64)
    } else {
      settingsStore.updateUserAvatar(base64)
    }
  }
  reader.readAsDataURL(file)
  // 清空input，允许重复选同一文件
  ;(e.target as HTMLInputElement).value = ''
}

const apiConfig = ref({
  model: 'qianwen' as AIModel,
  apiKey: '',
  baseUrl: ''
})

const systemPrompt = ref('')
const testing = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

onMounted(() => {
  settingsStore.loadSettings()
  apiConfig.value = {
    ...settingsStore.settings.apiConfig,
    baseUrl: settingsStore.settings.apiConfig.baseUrl ?? ''
  }
  systemPrompt.value = settingsStore.settings.systemPrompt
})

const handleSaveAPI = () => {
  settingsStore.updateAPIConfig(
    apiConfig.value.model,
    apiConfig.value.apiKey,
    apiConfig.value.baseUrl
  )
  alert('API配置已保存')
}

const handleTestConnection = async () => {
  if (!apiConfig.value.apiKey) {
    alert('请先输入API Key')
    return
  }

  testing.value = true
  testResult.value = null

  try {
    const success = await testAPIConnection(
      apiConfig.value.model,
      apiConfig.value.apiKey,
      apiConfig.value.baseUrl
    )

    testResult.value = {
      success,
      message: success ? '✅ 连接成功!' : '❌ 连接失败,请检查API Key和网络'
    }
  } catch (error: any) {
    testResult.value = {
      success: false,
      message: `❌ 连接失败: ${error.message}`
    }
  } finally {
    testing.value = false
  }
}

const handleSavePrompt = () => {
  settingsStore.updateSystemPrompt(systemPrompt.value)
  alert('系统提示词已保存')
}

const handleResetPrompt = () => {
  if (confirm('确定要恢复默认提示词吗?')) {
    settingsStore.loadSettings()
    systemPrompt.value = settingsStore.settings.systemPrompt
  }
}

const handleExportData = () => {
  const data = {
    messages: localStorage.getItem('chat_messages'),
    cards: localStorage.getItem('cards'),
    memories: localStorage.getItem('memories'),
    elements: localStorage.getItem('elements'),
    settings: localStorage.getItem('settings')
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `xiaomoli-backup-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const handleImportData = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = (e: any) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event: any) => {
      try {
        const data = JSON.parse(event.target.result)
        if (data.messages) localStorage.setItem('chat_messages', data.messages)
        if (data.cards) localStorage.setItem('cards', data.cards)
        if (data.memories) localStorage.setItem('memories', data.memories)
        if (data.elements) localStorage.setItem('elements', data.elements)
        if (data.settings) localStorage.setItem('settings', data.settings)

        alert('数据导入成功!刷新页面后生效')
        location.reload()
      } catch (error) {
        alert('数据导入失败,文件格式错误')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}

const handleClearData = () => {
  if (confirm('确定要清空所有数据吗?此操作不可恢复!')) {
    if (confirm('再次确认:真的要清空所有数据吗?')) {
      localStorage.clear()
      alert('所有数据已清空!刷新页面后生效')
      location.reload()
    }
  }
}
</script>
