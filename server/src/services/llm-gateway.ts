/**
 * LLM Gateway —— M2
 *
 * 职责：
 *   1. 三级模型路由：chat（对话）/ extraction（记忆提取）/ eval（评估）
 *      —— 不同任务用不同档位的模型，控制成本与延迟
 *   2. 超时控制 + 失败重试（防「敏感内容静默跳过」的第一道防线：
 *      空产出/网络失败在这里被发现并重试，完整防坑管道在 M3 落地）
 *   3. 统一 OpenAI 兼容协议（deepseek/qianwen/zhipu/openai 等），claude/wenxin
 *      由前端直连路径兜底
 *
 * API Key 不落库：由前端每轮请求通过 Header 传入（用户数据主权原则）
 */

export type LLMTier = 'chat' | 'extraction' | 'eval'

interface TierConfig {
  /** 实际模型 id（可用环境变量覆盖） */
  model: string
  temperature: number
  timeoutMs: number
  retries: number
}

const DEFAULT_TIERS: Record<LLMTier, TierConfig> = {
  chat: {
    model: process.env.LLM_CHAT_MODEL || 'deepseek-chat',
    temperature: 0.8,
    timeoutMs: 120_000,
    retries: 1,
  },
  extraction: {
    model: process.env.LLM_EXTRACT_MODEL || 'deepseek-chat',
    temperature: 0.2,
    timeoutMs: 90_000,
    retries: 2,
  },
  eval: {
    model: process.env.LLM_EVAL_MODEL || 'deepseek-chat',
    temperature: 0,
    timeoutMs: 60_000,
    retries: 1,
  },
}

export interface GatewayRequest {
  baseUrl: string
  apiKey: string
  /** 覆盖 tier 默认模型（用户在设置页显式选择的模型优先） */
  modelOverride?: string
  tier: LLMTier
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}

export interface GatewayStreamResult {
  text: string
  /** 实际使用的模型（写入 trace） */
  model: string
  /** 重试次数 */
  retries: number
  /** 调用耗时 */
  elapsedMs: number
}

/**
 * 流式对话调用。onDelta 实时回调增量文本。
 * 失败（网络错误 / 5xx / 超时）时重试；重试耗尽抛出原始错误。
 */
export async function chatStream(
  req: GatewayRequest,
  onDelta: (text: string) => void,
): Promise<GatewayStreamResult> {
  const tier = DEFAULT_TIERS[req.tier]
  const model = req.modelOverride || tier.model
  const started = Date.now()

  let lastError: unknown
  for (let attempt = 0; attempt <= tier.retries; attempt++) {
    try {
      const text = await callOnce(req, model, tier, onDelta)
      return { text, model, retries: attempt, elapsedMs: Date.now() - started }
    } catch (err) {
      lastError = err
      // 4xx（除 429）是请求本身的问题，重试无意义
      if (err instanceof GatewayHttpError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err
      }
      console.warn(`[llm-gateway] ${req.tier} 第 ${attempt + 1} 次调用失败，${attempt < tier.retries ? '重试中' : '放弃'}:`, err instanceof Error ? err.message : err)
      if (attempt < tier.retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))) // 退避
      }
    }
  }
  throw lastError
}

export class GatewayHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function callOnce(
  req: GatewayRequest,
  model: string,
  tier: TierConfig,
  onDelta: (text: string) => void,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), tier.timeoutMs)

  let res: Response
  try {
    res = await fetch(`${req.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: req.messages,
        temperature: tier.temperature,
        stream: true,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    throw new GatewayHttpError(0, `LLM 网络错误: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    // 流读取期间也保持超时控制（AbortController 已绑定 stream）
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new GatewayHttpError(res.status, `LLM API ${res.status}: ${errText.slice(0, 300)}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new GatewayHttpError(0, 'LLM 响应无内容流')

  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const delta: string = json.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            full += delta
            onDelta(delta)
          }
        } catch {
          // 忽略无法解析的行（心跳/注释等）
        }
      }
    }
  } finally {
    clearTimeout(timer)
    reader.releaseLock?.()
  }

  if (!full.trim()) {
    // 空产出：LLM 静默跳过的信号（小红书实战踩坑：Claude 遇敏感内容会静默返回空）
    throw new GatewayHttpError(0, 'LLM 返回空内容（可能触发内容过滤），需重试或换路由')
  }

  return full
}

/**
 * 非流式调用（M3 记忆提取管道用：提取/评估任务不需要流式）
 */
export async function chatComplete(req: GatewayRequest): Promise<GatewayStreamResult> {
  const tier = DEFAULT_TIERS[req.tier]
  const model = req.modelOverride || tier.model
  const started = Date.now()

  let lastError: unknown
  for (let attempt = 0; attempt <= tier.retries; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), tier.timeoutMs)
      const res = await fetch(`${req.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${req.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
          temperature: tier.temperature,
        }),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new GatewayHttpError(res.status, `LLM API ${res.status}: ${errText.slice(0, 300)}`)
      }
      const json = await res.json()
      const text: string = json.choices?.[0]?.message?.content ?? ''
      if (!text.trim()) throw new GatewayHttpError(0, 'LLM 返回空内容')
      return { text, model, retries: attempt, elapsedMs: Date.now() - started }
    } catch (err) {
      lastError = err
      if (err instanceof GatewayHttpError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err
      }
      if (attempt < tier.retries) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
  throw lastError
}
