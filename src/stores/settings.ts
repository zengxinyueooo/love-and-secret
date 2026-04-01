import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Settings, AIModel } from '../types'

// 默认的系统提示词
const defaultSystemPrompt = `你现在扮演《恋与深空》中的黎深。

# 人设特点
- 性格:外冷内热,温润如玉,谦谦君子
- 身份:心外科副主任医生,高智商天才,上古神九黎司命
- 特点:14岁上大学,医科圣手,冷笑话大王,对你独一份温柔
- 代表元素:蓝色、雪花、茉莉花、雪豹、企鹅

# 对话风格
- 温柔体贴,会用行动表达关心
- 偶尔说一些冷笑话
- 作为医生,会关心对方的健康
- 话语中透露出深厚的感情,但不会过于直白
- 使用"你"而不是"您"

# 经典语录参考
"灵魂先于我的记忆,认出了你。"
"那等我在你的黄昏醒来,再对你说早安。"
"相信我,这一秒过后,就是雨过天晴了。"
"但我的世界,恰好需要她的吵闹。"
"有事常联系,没事也可以。"
"我的目光,属于你很久了。"
"看见雪停,我便猜是你要到了。"
"希望你不要生病,不要受伤,不要总和黎医生见面。而是多和黎深见面。"

请以黎深的身份,用温柔、体贴的语气与用户对话。`

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({
    apiConfig: {
      model: 'qianwen',
      apiKey: '',
      baseUrl: ''
    },
    systemPrompt: defaultSystemPrompt,
    snowflakeEnabled: true,
    backgroundMusicEnabled: false,
    backgroundConfig: {
      homeBackground: undefined,
      chatBackground: undefined,
      chatBackgroundOpacity: 0.3
    },
    avatarConfig: {
      assistantAvatar: undefined,
      userAvatar: undefined
    }
  })

  // 从localStorage加载设置
  const loadSettings = () => {
    const saved = localStorage.getItem('settings')
    if (saved) {
      const loadedSettings = JSON.parse(saved)
      // 合并设置，确保新字段有默认值
      settings.value = {
        ...settings.value,
        ...loadedSettings,
        backgroundConfig: {
          homeBackground: loadedSettings.backgroundConfig?.homeBackground,
          chatBackground: loadedSettings.backgroundConfig?.chatBackground,
          chatBackgroundOpacity: loadedSettings.backgroundConfig?.chatBackgroundOpacity ?? 0.3
        },
        avatarConfig: {
          assistantAvatar: loadedSettings.avatarConfig?.assistantAvatar,
          userAvatar: loadedSettings.avatarConfig?.userAvatar
        }
      }
    }
  }

  // 保存设置到localStorage
  const saveSettings = () => {
    localStorage.setItem('settings', JSON.stringify(settings.value))
  }

  // 更新API配置
  const updateAPIConfig = (model: AIModel, apiKey: string, baseUrl?: string) => {
    settings.value.apiConfig = { model, apiKey, baseUrl }
    saveSettings()
  }

  // 更新系统提示词
  const updateSystemPrompt = (prompt: string) => {
    settings.value.systemPrompt = prompt
    saveSettings()
  }

  // 切换雪花效果
  const toggleSnowflake = () => {
    settings.value.snowflakeEnabled = !settings.value.snowflakeEnabled
    saveSettings()
  }

  // 切换背景音乐
  const toggleBackgroundMusic = () => {
    settings.value.backgroundMusicEnabled = !settings.value.backgroundMusicEnabled
    saveSettings()
  }

  // 更新主页背景
  const updateHomeBackground = (imageData: string | undefined) => {
    settings.value.backgroundConfig.homeBackground = imageData
    saveSettings()
  }

  // 更新聊天背景
  const updateChatBackground = (imageData: string | undefined) => {
    settings.value.backgroundConfig.chatBackground = imageData
    saveSettings()
  }

  // 更新聊天背景透明度
  const updateChatBackgroundOpacity = (opacity: number) => {
    settings.value.backgroundConfig.chatBackgroundOpacity = opacity
    saveSettings()
  }

  // 更新助手头像
  const updateAssistantAvatar = (imageData: string | undefined) => {
    settings.value.avatarConfig.assistantAvatar = imageData
    saveSettings()
  }

  // 更新用户头像
  const updateUserAvatar = (imageData: string | undefined) => {
    settings.value.avatarConfig.userAvatar = imageData
    saveSettings()
  }

  return {
    settings,
    loadSettings,
    saveSettings,
    updateAPIConfig,
    updateSystemPrompt,
    toggleSnowflake,
    toggleBackgroundMusic,
    updateHomeBackground,
    updateChatBackground,
    updateChatBackgroundOpacity,
    updateAssistantAvatar,
    updateUserAvatar
  }
})
