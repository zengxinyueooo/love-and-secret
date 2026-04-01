import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Card } from '../types'

// 预设的卡面数据
const defaultCards: Card[] = [
  {
    id: '1',
    imageUrl: 'https://via.placeholder.com/400x600/4A90E2/ffffff?text=卡面1',
    title: '雪中相遇',
    quote: '灵魂先于我的记忆,认出了你。那等我在你的黄昏醒来,再对你说早安。',
    collectedDate: Date.now() - 86400000 * 7
  },
  {
    id: '2',
    imageUrl: 'https://via.placeholder.com/400x600/2C5F8D/ffffff?text=卡面2',
    title: '茉莉花开',
    quote: '光阴漫长,你不是第一个进入荆棘高塔的人。但是除了你,没人能让茉莉盛开。',
    collectedDate: Date.now() - 86400000 * 3
  },
  {
    id: '3',
    imageUrl: 'https://via.placeholder.com/400x600/5BA3E8/ffffff?text=卡面3',
    title: '冬日暖阳',
    quote: '相信我,这一秒过后,就是雨过天晴了。但我的世界,恰好需要她的吵闹。',
    collectedDate: Date.now() - 86400000
  },
  {
    id: '4',
    imageUrl: 'https://via.placeholder.com/400x600/3A7FC2/ffffff?text=卡面4',
    title: '久别重逢',
    quote: '久别重逢,是个好词。时间无法治愈一切,也无法让你遗忘伤痛,只会让你慢慢习惯。',
    collectedDate: Date.now()
  },
  {
    id: '5',
    imageUrl: 'https://via.placeholder.com/400x600/6BB0F0/ffffff?text=卡面5',
    title: '雪停之时',
    quote: '看见雪停,我便猜是你要到了。带上伞,我的雪不会融化。每一个下雪的日子,都让我想起一个人,好在,就要见面了。',
    collectedDate: Date.now() - 86400000 * 2
  }
]

export const useCardsStore = defineStore('cards', () => {
  const cards = ref<Card[]>([])

  // 从localStorage加载卡面
  const loadCards = () => {
    const saved = localStorage.getItem('cards')
    if (saved) {
      cards.value = JSON.parse(saved)
    } else {
      // 如果没有保存的数据,使用默认数据
      cards.value = defaultCards
      saveCards()
    }
  }

  // 保存卡面到localStorage
  const saveCards = () => {
    localStorage.setItem('cards', JSON.stringify(cards.value))
  }

  // 添加新卡面
  const addCard = (card: Omit<Card, 'id' | 'collectedDate'>) => {
    const newCard: Card = {
      ...card,
      id: Date.now().toString(),
      collectedDate: Date.now()
    }
    cards.value.unshift(newCard)
    saveCards()
  }

  // 删除卡面
  const deleteCard = (id: string) => {
    cards.value = cards.value.filter(card => card.id !== id)
    saveCards()
  }

  return {
    cards,
    loadCards,
    addCard,
    deleteCard
  }
})
