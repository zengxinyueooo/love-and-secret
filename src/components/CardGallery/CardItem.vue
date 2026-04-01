<template>
  <div
    class="card overflow-hidden cursor-pointer transform hover:scale-105 transition-all duration-300"
    @click="$emit('click')"
  >
    <div class="aspect-[2/3] bg-gray-200 overflow-hidden">
      <img
        :src="card.imageUrl"
        :alt="card.title"
        class="w-full h-full object-cover"
      />
    </div>
    <div class="p-4">
      <h3 class="font-bold text-lg text-gray-800 mb-2">{{ card.title }}</h3>
      <p class="text-sm text-gray-600 line-clamp-2">{{ card.quote }}</p>
      <div class="text-xs text-gray-400 mt-2">
        {{ getRelativeTime(card.collectedDate) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getRelativeTime } from '../../utils/date'
import type { Card } from '../../types'

defineProps<{
  card: Card
}>()

defineEmits<{
  click: []
}>()
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
