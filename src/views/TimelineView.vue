<template>
  <div class="min-h-[calc(100vh-64px)] bg-bg-main p-6">
    <div class="container mx-auto max-w-4xl">
      <!-- 头部 -->
      <div class="flex justify-between items-center mb-8">
        <h1 class="text-3xl font-bold text-gray-800">📝 回忆时间线</h1>
        <button @click="showAddModal = true" class="btn-primary">
          ➕ 添加回忆
        </button>
      </div>

      <!-- 时间线 -->
      <div v-if="memoriesStore.memories.length > 0" class="relative">
        <!-- 时间线竖线 -->
        <div class="absolute left-8 top-0 bottom-0 w-0.5 bg-primary"></div>

        <!-- 回忆项 -->
        <div
          v-for="memory in memoriesStore.memories"
          :key="memory.id"
          class="relative pl-20 pb-12 fade-in"
        >
          <!-- 时间点 -->
          <div class="absolute left-6 w-5 h-5 bg-primary rounded-full border-4 border-white shadow-md"></div>

          <!-- 内容卡片 -->
          <div class="card p-6">
            <div class="flex justify-between items-start mb-3">
              <div>
                <h3 class="text-xl font-bold text-gray-800 mb-1">{{ memory.title }}</h3>
                <p class="text-sm text-gray-500">{{ formatDate(memory.date, 'YYYY-MM-DD') }}</p>
              </div>
              <button
                @click="handleDeleteMemory(memory.id)"
                class="text-gray-400 hover:text-red-500 transition-colors"
              >
                🗑️
              </button>
            </div>

            <p class="text-gray-700 whitespace-pre-wrap mb-4">{{ memory.description }}</p>

            <!-- 图片 -->
            <div v-if="memory.imageUrl" class="rounded-lg overflow-hidden">
              <img
                :src="memory.imageUrl"
                :alt="memory.title"
                class="w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="text-center py-20">
        <div class="text-6xl mb-4">📝</div>
        <h2 class="text-2xl font-bold text-gray-700 mb-2">还没有记录回忆</h2>
        <p class="text-gray-500 mb-4">点击右上角按钮记录你和黎深的美好时光吧!</p>
      </div>
    </div>

    <!-- 添加回忆弹窗 -->
    <AddMemoryModal v-model="showAddModal" @add="handleAddMemory" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMemoriesStore } from '../stores/memories'
import { formatDate } from '../utils/date'
import AddMemoryModal from '../components/Timeline/AddMemoryModal.vue'
import type { Memory } from '../types'

const memoriesStore = useMemoriesStore()
const showAddModal = ref(false)

onMounted(() => {
  memoriesStore.loadMemories()
})

const handleDeleteMemory = (id: string) => {
  if (confirm('确定要删除这条回忆吗?')) {
    memoriesStore.deleteMemory(id)
  }
}

const handleAddMemory = (memory: Omit<Memory, 'id'>) => {
  memoriesStore.addMemory(memory)
}
</script>
