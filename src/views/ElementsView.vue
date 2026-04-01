<template>
  <div class="min-h-[calc(100vh-64px)] bg-bg-main p-6">
    <div class="container mx-auto">
      <!-- 头部 -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-800 mb-2">✨ 元素图鉴</h1>
        <p class="text-gray-600">收集黎深相关的所有元素</p>
      </div>

      <!-- 元素网格 -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <div
          v-for="element in elementsStore.elements"
          :key="element.id"
          class="card p-6 text-center fade-in"
          :class="{ 'opacity-50': !element.unlocked }"
        >
          <!-- 图标 -->
          <div class="text-6xl mb-4">
            {{ element.unlocked ? element.imageUrl : '🔒' }}
          </div>

          <!-- 名称 -->
          <h3 class="font-bold text-lg text-gray-800 mb-2">
            {{ element.unlocked ? element.name : '???' }}
          </h3>

          <!-- 描述 -->
          <p class="text-sm text-gray-600">
            {{ element.unlocked ? element.description : '尚未解锁' }}
          </p>

          <!-- 解锁状态 -->
          <div class="mt-4">
            <span
              v-if="element.unlocked"
              class="inline-block px-3 py-1 bg-primary text-white text-xs rounded-full"
            >
              已解锁
            </span>
            <span
              v-else
              class="inline-block px-3 py-1 bg-gray-300 text-gray-600 text-xs rounded-full"
            >
              未解锁
            </span>
          </div>
        </div>
      </div>

      <!-- 统计信息 -->
      <div class="mt-8 text-center">
        <div class="inline-block card px-8 py-4">
          <p class="text-gray-600">
            已解锁 <span class="text-2xl font-bold text-primary mx-2">{{ unlockedCount }}</span> /
            <span class="text-2xl font-bold text-gray-800 mx-2">{{ totalCount }}</span> 个元素
          </p>
          <div class="mt-4 w-full bg-gray-200 rounded-full h-2">
            <div
              class="bg-primary h-2 rounded-full transition-all duration-500"
              :style="{ width: `${progress}%` }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useElementsStore } from '../stores/elements'

const elementsStore = useElementsStore()

onMounted(() => {
  elementsStore.loadElements()
})

const unlockedCount = computed(() => {
  return elementsStore.elements.filter((el) => el.unlocked).length
})

const totalCount = computed(() => {
  return elementsStore.elements.length
})

const progress = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((unlockedCount.value / totalCount.value) * 100)
})
</script>
