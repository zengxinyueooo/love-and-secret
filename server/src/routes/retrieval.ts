/**
 * 检索路由 —— M4 调试用
 *
 * GET /api/retrieval/search?q=<query>&topK=<n>[&conversationId=<uuid>]
 *   返回：{ items: RetrievedMemory[], trace: RetrievalTrace }
 *
 *   conversationId 可选：不传 = 全库检索（记忆本就跨会话积累）
 *   传了 = 只在该会话内检索（调试单会话场景用）
 *
 * 用于：
 *   - 手动验证混合检索质量（curl / 前端 console）
 *   - M6/M8 Eval benchmark 调用的统一入口
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { searchMemories } from '../services/retrieval.js'

const retrieval = new Hono()

retrieval.get('/search', async (c) => {
  const raw = c.req.query('conversationId')
  const conversationId = z.string().uuid().optional().parse(raw || undefined)
  const q = z.string().min(1).max(500).parse(c.req.query('q'))
  const topK = Number(c.req.query('topK') ?? 8)

  const { items, trace } = await searchMemories(q, conversationId ?? null, topK)
  return c.json({ items, trace })
})

export default retrieval