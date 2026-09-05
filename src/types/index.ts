// 消息类型
export interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: number
}

// 卡面类型
export interface Card {
  id: string
  imageUrl: string
  title: string
  quote: string
  collectedDate: number
}

// 回忆类型
export interface Memory {
  id: string
  date: number
  title: string
  description: string
  imageUrl?: string
}

// 元素类型
export interface Element {
  id: string
  name: string
  description: string
  imageUrl: string
  unlocked: boolean
}

// AI模型类型
export type AIModel = 'openai' | 'claude' | 'qianwen' | 'wenxin' | 'zhipu' | 'deepseek'

// API配置类型
export interface APIConfig {
  model: AIModel
  apiKey: string
  baseUrl?: string
}

// 背景图片配置类型
export interface BackgroundConfig {
  homeBackground?: string
  chatBackground?: string
  chatBackgroundOpacity: number
}

// 头像配置类型
export interface AvatarConfig {
  assistantAvatar?: string  // base64或URL，未设置时显示默认emoji
  userAvatar?: string       // base64或URL，未设置时显示默认emoji
}

// 设置类型
export interface Settings {
  apiConfig: APIConfig
  systemPrompt: string
  /** 用户自由维护的补充设定（场景前置剧情、昵称、补充世界观等），拼到 systemPrompt 末尾 */
  userSupplement: string
  snowflakeEnabled: boolean
  backgroundMusicEnabled: boolean
  backgroundConfig: BackgroundConfig
  avatarConfig: AvatarConfig
}

/** ============== Trace 面板（M6） ============== */

export interface TraceLayer {
  layer: string
  chars: number
  source: string
  injected: boolean
}

export interface ContextTrace {
  layers: TraceLayer[]
  recentMessageIds: string[]
  totalChars: number
  elapsedMs: number
  version: string
  llm?: { model: string; retries: number; elapsedMs: number }
  /** L5 检索到的记忆条目（来自 L5 injected 后的 query 上下文） */
  retrievedItems?: RetrievedMemoryItem[]
}

export interface RetrievedMemoryItem {
  id: string
  kind: 'fact' | 'episode' | 'emotion' | 'event'
  content: string
  importance: number
  score: number
  source: 'vector' | 'text' | 'both'
}

export interface TraceMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  turnIndex: number
  createdAt: string
  meta?: { trace?: ContextTrace; extraction?: unknown; error?: unknown }
}
