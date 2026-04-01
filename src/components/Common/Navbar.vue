<template>
  <nav class="bg-white shadow-md sticky top-0 z-50">
    <div class="container mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <!-- Logo -->
        <div class="flex items-center space-x-3 cursor-pointer" @click="router.push('/')">
          <span class="text-2xl">🌼</span>
          <h1 class="text-xl font-bold text-primary">小茉梨的秘密空间</h1>
        </div>

        <!-- 导航链接 -->
        <div class="hidden md:flex space-x-8">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="nav-link"
            active-class="nav-link-active"
          >
            <span class="text-xl mr-2">{{ item.icon }}</span>
            {{ item.name }}
          </router-link>
        </div>

        <!-- 移动端菜单按钮 -->
        <button class="md:hidden" @click="mobileMenuOpen = !mobileMenuOpen">
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </div>

      <!-- 移动端菜单 -->
      <div v-if="mobileMenuOpen" class="md:hidden mt-4 pb-4">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="block py-2 nav-link"
          active-class="nav-link-active"
          @click="mobileMenuOpen = false"
        >
          <span class="text-xl mr-2">{{ item.icon }}</span>
          {{ item.name }}
        </router-link>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const mobileMenuOpen = ref(false)

const navItems = [
  { name: '主页', path: '/', icon: '🏠' },
  { name: '对话', path: '/chat', icon: '💬' },
  { name: '卡面收藏', path: '/cards', icon: '🎴' },
  { name: '回忆时间线', path: '/timeline', icon: '📝' },
  { name: '元素图鉴', path: '/elements', icon: '✨' },
  { name: '设置', path: '/settings', icon: '⚙️' }
]
</script>

<style scoped>
.nav-link {
  @apply text-gray-700 hover:text-primary transition-colors duration-300 flex items-center;
}

.nav-link-active {
  @apply text-primary font-semibold;
}
</style>
