/**
 * 检索路由 —— M4 调试用
 *
 * GET /api/retrieval/search?conversationId=<uuid>&q=<query>&topK=<n>
 *   返回：{ items: RetrievedMemory[], trace: RetrievalTrace }
 *
 * 用于：
 *   - 手动验证混合检索质量（curl / 前端 console）
 *   - M6 Eval benchmark 调用的统一入口
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { searchMemories } from '../services/retrieval.js'

const retrieval = new Hono()

retrieval.get('/search', async (c) => {
  const conversationId = z.string().uuid().parse(c.req.query('conversationId'))
  const q = z.string().min(1).max(500).parse(c.req.query('q'))
  const topK = Number(c.req.query('topK') ?? 8)

  const { items, trace } = await searchMemories(q, conversationId, topK)
  return c.json({ items, trace })
})

export default retrieval