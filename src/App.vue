<script setup lang="ts">
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import Navbar from './components/Common/Navbar.vue'
import SnowfallBackground from './components/Common/SnowfallBackground.vue'
import { useSettingsStore } from './stores/settings'

const settingsStore = useSettingsStore()
settingsStore.loadSettings()

const showSnowfall = computed(() => settingsStore.settings.snowflakeEnabled)
</script>

<template>
  <div class="min-h-screen bg-bg-main relative">
    <!-- 雪花背景 -->
    <SnowfallBackground v-if="showSnowfall" />

    <!-- 导航栏 -->
    <Navbar />

    <!-- 主内容区 -->
    <div class="relative z-10">
      <RouterView />
    </div>
  </div>
</template>
