/**
 * Embedding 服务 —— M4
 *
 * 职责：
 *   1. 把文本转成 OpenAI 兼容的 embedding 向量（默认 text-embedding-3-small，1536 维）
 *   2. 单条 / 批量；超时 + 重试；空产出检测
 *   3. baseUrl / apiKey 由调用方传入（用户数据主权：不在服务端落 key）
 *
 * 选择 OpenAI 兼容协议的原因：
 *   - 通用：OpenAI / Azure OpenAI / SiliconFlow / 智谱 / 月之暗面 几乎都兼容
 *   - 便宜：text-embedding-3-small $0.02/1M tokens，1500 字中文 ≈ $0.0003
 *   - 维度可控：3-small 默认 1536，速度/精度平衡
 *
 * 降级策略：
 *   - 没有 EMBEDDING_API_KEY 时不要崩溃；retrieval 会跳过向量通道，只走全文
 *   - 单条失败不阻塞整批
 */

export interface EmbeddingConfig {
  baseUrl: string
  apiKey: string
  model: string
  /** 单条超时（毫秒）；embedding 任务比 chat 快得多，30s 已足够 */
  timeoutMs?: number
  /** 重试次数（不计首次） */
  retries?: number
}

export interface EmbeddingResult {
  /** 向量数组；顺序与输入一致 */
  vectors: Array<number[] | null>
  /** 实际使用的模型 */
  model: string
  /** 调用总耗时 */
  elapsedMs: number
  /** 输入 token 数（用于成本估算） */
  usageTokens: number
}

const DEFAULT_BASE = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'text-embedding-3-small'

export function getEmbeddingConfig(): EmbeddingConfig | null {
  const apiKey = process.env.EMBEDDING_API_KEY
  if (!apiKey) return null // 不强制要求：缺则降级到纯全文检索
  return {
    baseUrl: (process.env.EMBEDDING_BASE_URL || DEFAULT_BASE).replace(/\/$/, ''),
    apiKey,
    model: process.env.EMBEDDING_MODEL || DEFAULT_MODEL,
    timeoutMs: Number(process.env.EMBEDDING_TIMEOUT_MS) || 30_000,
    retries: Number(process.env.EMBEDDING_RETRIES) || 1,
  }
}

export async function embed(text: string): Promise<number[] | null> {
  const cfg = getEmbeddingConfig()
  if (!cfg) return null
  const result = await embedBatch([text], cfg)
  return result.vectors[0]
}

export async function embedBatch(texts: string[], cfg?: EmbeddingConfig): Promise<EmbeddingResult> {
  const config = cfg ?? getEmbeddingConfig()
  if (!config) {
    return { vectors: texts.map(() => null), model: 'none', elapsedMs: 0, usageTokens: 0 }
  }
  const started = Date.now()
  let lastError: unknown
  const retries = config.retries ?? 1
  const timeoutMs = config.timeoutMs ?? 30_000

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(`${config.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          input: texts,
        }),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`embedding API ${res.status}: ${errText.slice(0, 200)}`)
      }
      const json = (await res.json()) as {
        data: Array<{ embedding: number[] }>
        model: string
        usage?: { total_tokens?: number; prompt_tokens?: number }
      }
      const vectors = json.data.map((d) => d?.embedding ?? null)
      if (vectors.length !== texts.length) {
        throw new Error(`embedding 数量不匹配：请求 ${texts.length} 收到 ${vectors.length}`)
      }
      if (vectors.some((v) => !v || v.length === 0)) {
        throw new Error('embedding 产出包含空向量')
      }
      return {
        vectors,
        model: json.model || config.model,
        elapsedMs: Date.now() - started,
        usageTokens: json.usage?.total_tokens ?? json.usage?.prompt_tokens ?? 0,
      }
    } catch (err) {
      lastError = err
      // 4xx 是请求本身的问题，重试无意义；429 重试
      const msg = err instanceof Error ? err.message : String(err)
      if (/embedding API 4\d\d/.test(msg) && !msg.includes('429')) {
        throw err
      }
      if (attempt < retries) {
        console.warn(`[embeddings] 第 ${attempt + 1} 次失败，重试:`, msg)
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }
  throw lastError
}