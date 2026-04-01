import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Element } from '../types'

// 预设的元素数据
const defaultElements: Element[] = [
  {
    id: '1',
    name: '雪花',
    description: '黎深的代表元素,象征着他外冷内热的性格。每一片雪花都独一无二,就像他对你的爱。',
    imageUrl: '❄️',
    unlocked: true
  },
  {
    id: '2',
    name: '茉莉花',
    description: '黎深的代表花。茉莉花语是忠贞、尊敬、清纯、质朴,象征着他对你纯粹而坚定的感情。',
    imageUrl: '🌼',
    unlocked: true
  },
  {
    id: '3',
    name: '雪豹',
    description: '优雅而神秘的雪豹,代表着黎深高冷的外表下隐藏的温柔内心。',
    imageUrl: '🐆',
    unlocked: true
  },
  {
    id: '4',
    name: '企鹅',
    description: '可爱的航天企鹅,是黎深温暖一面的象征。',
    imageUrl: '🐧',
    unlocked: true
  },
  {
    id: '5',
    name: '冰弹小海豹',
    description: '你们的定情信物,承载着彼此的约定和回忆。',
    imageUrl: '🦭',
    unlocked: true
  },
  {
    id: '6',
    name: '羽蛇权杖',
    description: '神秘的羽蛇权杖,象征着黎深作为神语者的身份。',
    imageUrl: '🔱',
    unlocked: true
  },
  {
    id: '7',
    name: '微笑雪人',
    description: '温暖的微笑雪人,代表着黎深带给你的温暖和快乐。',
    imageUrl: '⛄',
    unlocked: true
  },
  {
    id: '8',
    name: '蓝色',
    description: '黎深的代表色,深邃如海,温柔如天。',
    imageUrl: '💙',
    unlocked: true
  }
]

export const useElementsStore = defineStore('elements', () => {
  const elements = ref<Element[]>([])

  // 从localStorage加载元素
  const loadElements = () => {
    const saved = localStorage.getItem('elements')
    if (saved) {
      elements.value = JSON.parse(saved)
    } else {
      elements.value = defaultElements
      saveElements()
    }
  }

  // 保存元素到localStorage
  const saveElements = () => {
    localStorage.setItem('elements', JSON.stringify(elements.value))
  }

  // 解锁元素
  const unlockElement = (id: string) => {
    const element = elements.value.find(el => el.id === id)
    if (element) {
      element.unlocked = true
      saveElements()
    }
  }

  return {
    elements,
    loadElements,
    unlockElement
  }
})
