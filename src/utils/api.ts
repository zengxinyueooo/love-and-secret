import type { AIModel } from '../types'

// 不同AI模型的API端点配置
const API_ENDPOINTS: Record<AIModel, { url: string }> = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions'
  },
  claude: {
    url: 'https://api.anthropic.com/v1/messages'
  },
  qianwen: {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  },
  wenxin: {
    url: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions'
  },
  zhipu: {
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/chat/completions'
  }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 构建请求体
 */
function buildRequestBody(model: AIModel, messages: ChatMessage[], stream: boolean) {
  switch (model) {
    case 'claude':
      return {
        model: 'claude-3-sonnet-20240229',
        messages: messages.filter(m => m.role !== 'system'),
        system: messages.find(m => m.role === 'system')?.content || '',
        max_tokens: 1024,
        stream
      }
    case 'qianwen':
      return {
        model: 'qwen-turbo',
        messages,
        temperature: 0.7,
        stream
      }
    default:
      // openai兼容格式（deepseek、zhipu、wenxin等）
      return {
        model: model === 'openai' ? 'gpt-3.5-turbo'
          : model === 'deepseek' ? 'deepseek-chat'
          : model === 'zhipu' ? 'glm-4'
          : 'default',
        messages,
        temperature: 0.7,
        stream
      }
  }
}

/**
 * 构建请求头
 */
function buildHeaders(model: AIModel, apiKey: string) {
  if (model === 'claude') {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }
  }
  if (model === 'wenxin') {
    return { 'Content-Type': 'application/json' }
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  }
}

/**
 * 从SSE数据行中提取文本内容
 */
function extractTextFromChunk(model: AIModel, data: string): string {
  try {
    const json = JSON.parse(data)
    if (model === 'claude') {
      if (json.type === 'content_block_delta') {
        return json.delta?.text || ''
      }
      return ''
    }
    // openai兼容格式
    return json.choices?.[0]?.delta?.content || ''
  } catch {
    return ''
  }
}

/**
 * 流式调用AI API，通过回调实时更新内容
 */
export async function sendChatMessageStream(
  model: AIModel,
  apiKey: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  baseUrl?: string
): Promise<void> {
  if (!apiKey) {
    throw new Error('请先配置API Key')
  }

  const endpoint = API_ENDPOINTS[model]
  let url = baseUrl || endpoint.url

  // 文心一言用access_token方式
  if (model === 'wenxin') {
    url = `${url}?access_token=${apiKey}`
  }

  const body = buildRequestBody(model, messages, true)
  const headers = buildHeaders(model, apiKey)

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`API错误 ${response.status}: ${errText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取响应流')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]') continue
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6)
        const text = extractTextFromChunk(model, data)
        if (text) onChunk(text)
      }
    }
  }
}

/**
 * 测试API连接（非流式）
 */
export async function testAPIConnection(
  model: AIModel,
  apiKey: string,
  baseUrl?: string
): Promise<boolean> {
  try {
    const endpoint = API_ENDPOINTS[model]
    let url = baseUrl || endpoint.url
    if (model === 'wenxin') url = `${url}?access_token=${apiKey}`

    const body = buildRequestBody(model, [
      { role: 'system', content: '你是一个测试助手' },
      { role: 'user', content: '测试' }
    ], false)
    const headers = buildHeaders(model, apiKey)

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
    return response.ok
  } catch {
    return false
  }
}
