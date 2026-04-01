<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="$emit('update:modelValue', false)"
    >
      <div class="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto fade-in">
        <div class="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <h2 class="text-2xl font-bold text-gray-800">{{ card.title }}</h2>
          <button
            @click="$emit('update:modelValue', false)"
            class="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div class="p-6">
          <div class="grid md:grid-cols-2 gap-6">
            <!-- 图片 -->
            <div class="aspect-[2/3] bg-gray-200 rounded-lg overflow-hidden">
              <img
                :src="card.imageUrl"
                :alt="card.title"
                class="w-full h-full object-cover"
              />
            </div>

            <!-- 信息 -->
            <div class="flex flex-col">
              <div class="mb-4">
                <h3 class="text-sm text-gray-500 mb-2">收藏时间</h3>
                <p class="text-gray-800">{{ formatDate(card.collectedDate, 'YYYY-MM-DD HH:mm') }}</p>
              </div>

              <div class="mb-4">
                <h3 class="text-sm text-gray-500 mb-2">语录</h3>
                <div class="bg-primary-light p-4 rounded-lg">
                  <p class="text-gray-800 whitespace-pre-wrap leading-relaxed">{{ card.quote }}</p>
                </div>
              </div>

              <div class="mt-auto pt-4 border-t border-gray-200">
                <button
                  @click="handleDelete"
                  class="text-red-500 hover:text-red-700 text-sm"
                >
                  🗑️ 删除此卡面
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { formatDate } from '../../utils/date'
import type { Card } from '../../types'

const props = defineProps<{
  modelValue: boolean
  card: Card
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  delete: []
}>()

const handleDelete = () => {
  if (confirm('确定要删除这张卡面吗?')) {
    emit('delete')
    emit('update:modelValue', false)
  }
}
</script>
