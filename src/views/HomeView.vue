<template>
  <div class="min-h-[calc(100vh-64px)] relative overflow-hidden">
    <!-- 背景图片 -->
    <div
      v-if="settingsStore.settings.backgroundConfig.homeBackground"
      class="absolute inset-0 bg-cover bg-center bg-no-repeat"
      :style="{
        backgroundImage: `url(${settingsStore.settings.backgroundConfig.homeBackground})`
      }"
    />

    <!-- 渐变遮罩 -->
    <div class="absolute inset-0 bg-gradient-to-b from-transparent via-bg-main/50 to-bg-main" />

    <!-- 内容区域 -->
    <div class="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-6">
      <div class="text-center fade-in">
        <!-- 主标题 -->
        <div class="mb-8">
          <div class="text-8xl mb-6 animate-float">❄️</div>
          <h1 class="text-5xl md:text-6xl font-bold text-primary mb-4">
            小茉梨的秘密空间
          </h1>
          <p class="text-xl text-gray-600 mb-2">与黎深的专属回忆</p>
          <p class="text-sm text-gray-500 italic">
            "灵魂先于我的记忆，认出了你。"
          </p>
        </div>

        <!-- 快捷入口卡片 -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mt-12">
          <router-link
            v-for="item in quickLinks"
            :key="item.path"
            :to="item.path"
            class="card p-6 hover:scale-105 transform transition-all duration-300 group"
          >
            <div class="text-4xl mb-3 group-hover:scale-110 transition-transform">
              {{ item.icon }}
            </div>
            <h3 class="font-bold text-gray-800 mb-1">{{ item.name }}</h3>
            <p class="text-xs text-gray-500">{{ item.desc }}</p>
          </router-link>
        </div>

        <!-- 上传背景按钮 -->
        <div class="mt-12">
          <button
            @click="showUploadModal = true"
            class="btn-secondary text-sm"
          >
            🖼️ 更换主页背景
          </button>
        </div>
      </div>
    </div>

    <!-- 上传背景图片弹窗 -->
    <UploadBackgroundModal
      v-model="showUploadModal"
      type="home"
      @upload="handleUploadBackground"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '../stores/settings'
import UploadBackgroundModal from '../components/Common/UploadBackgroundModal.vue'

const settingsStore = useSettingsStore()
const showUploadModal = ref(false)

onMounted(() => {
  settingsStore.loadSettings()
})

const quickLinks = [
  {
    name: '对话',
    path: '/chat',
    icon: '💬',
    desc: '与黎深聊天'
  },
  {
    name: '卡面收藏',
    path: '/cards',
    icon: '🎴',
    desc: '精美卡面'
  },
  {
    name: '回忆时间线',
    path: '/timeline',
    icon: '📝',
    desc: '美好时光'
  },
  {
    name: '元素图鉴',
    path: '/elements',
    icon: '✨',
    desc: '收集元素'
  }
]

const handleUploadBackground = (imageData: string) => {
  settingsStore.updateHomeBackground(imageData)
}
</script>

<style scoped>
@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-20px);
  }
}

.animate-float {
  animation: float 3s ease-in-out infinite;
}
</style>
