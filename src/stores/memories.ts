import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Memory } from '../types'

// 预设的回忆数据
const defaultMemories: Memory[] = [
  {
    id: '1',
    date: Date.now() - 86400000 * 30,
    title: '初次相遇',
    description: '在那个飘雪的冬日,我第一次见到了他。温润如玉的笑容,让整个世界都温暖了起来。'
  },
  {
    id: '2',
    date: Date.now() - 86400000 * 15,
    title: '茉莉花开的季节',
    description: '他说:"光阴漫长,你不是第一个进入荆棘高塔的人。但是除了你,没人能让茉莉盛开。"那一刻,我知道我们之间有着特殊的羁绊。'
  },
  {
    id: '3',
    date: Date.now() - 86400000 * 5,
    title: '雪停之时',
    description: '看见雪停,我便猜是你要到了。他总是在我需要的时候出现,带着那份独属于我的温柔。'
  }
]

export const useMemoriesStore = defineStore('memories', () => {
  const memories = ref<Memory[]>([])

  // 从localStorage加载回忆
  const loadMemories = () => {
    const saved = localStorage.getItem('memories')
    if (saved) {
      memories.value = JSON.parse(saved)
    } else {
      memories.value = defaultMemories
      saveMemories()
    }
  }

  // 保存回忆到localStorage
  const saveMemories = () => {
    localStorage.setItem('memories', JSON.stringify(memories.value))
  }

  // 添加新回忆
  const addMemory = (memory: Omit<Memory, 'id'>) => {
    const newMemory: Memory = {
      ...memory,
      id: Date.now().toString()
    }
    memories.value.unshift(newMemory)
    saveMemories()
  }

  // 删除回忆
  const deleteMemory = (id: string) => {
    memories.value = memories.value.filter(memory => memory.id !== id)
    saveMemories()
  }

  return {
    memories,
    loadMemories,
    addMemory,
    deleteMemory
  }
})
