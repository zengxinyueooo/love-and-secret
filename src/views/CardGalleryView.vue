<template>
  <div class="min-h-[calc(100vh-64px)] bg-bg-main p-6">
    <div class="container mx-auto">
      <!-- 头部 -->
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold text-gray-800">🎴 卡面收藏馆</h1>
        <button @click="showAddModal = true" class="btn-primary">
          ➕ 添加新卡面
        </button>
      </div>

      <!-- 卡面网格 -->
      <div v-if="cardsStore.cards.length > 0" class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <CardItem
          v-for="card in cardsStore.cards"
          :key="card.id"
          :card="card"
          @click="openCardModal(card)"
        />
      </div>

      <!-- 空状态 -->
      <div v-else class="text-center py-20">
        <div class="text-6xl mb-4">🎴</div>
        <h2 class="text-2xl font-bold text-gray-700 mb-2">还没有收藏卡面</h2>
        <p class="text-gray-500 mb-4">点击右上角按钮添加你的第一张卡面吧!</p>
      </div>
    </div>

    <!-- 卡面详情弹窗 -->
    <CardModal
      v-if="selectedCard"
      v-model="showCardModal"
      :card="selectedCard"
      @delete="handleDeleteCard(selectedCard.id)"
    />

    <!-- 添加卡面弹窗 -->
    <AddCardModal v-model="showAddModal" @add="handleAddCard" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useCardsStore } from '../stores/cards'
import CardItem from '../components/CardGallery/CardItem.vue'
import CardModal from '../components/CardGallery/CardModal.vue'
import AddCardModal from '../components/CardGallery/AddCardModal.vue'
import type { Card } from '../types'

const cardsStore = useCardsStore()
const showCardModal = ref(false)
const showAddModal = ref(false)
const selectedCard = ref<Card | null>(null)

onMounted(() => {
  cardsStore.loadCards()
})

const openCardModal = (card: Card) => {
  selectedCard.value = card
  showCardModal.value = true
}

const handleDeleteCard = (id: string) => {
  cardsStore.deleteCard(id)
}

const handleAddCard = (card: Omit<Card, 'id' | 'collectedDate'>) => {
  cardsStore.addCard(card)
}
</script>
