/**
 * 聊天路由 —— M2
 *
 * POST /api/conversations/:id/chat
 *   Header: Authorization: Bearer <apiKey>
 *           X-LLM-Base-URL: https://api.deepseek.com/v1  （可选，默认 deepseek）
 *           X-LLM-Model: deepseek-chat                    （可选，覆盖 tier 默认）
 *   Body:   { content: string }
 *   响应:   SSE 流
 *           event: delta → { text }
 *           event: done  → { userMessageId, assistantMessageId, trace }
 *           event: error → { message }
 *
 * 流程：存用户消息 → 装配七层 Context → LLM Gateway 流式调用 →
 *       存助手消息（meta 写入 Context Trace）→ 前端增量渲染
 */
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { conversations, messages } from '../db/schema.js'
import { assembleContext } from '../services/context-assembler.js'
import { chatStream } from '../services/llm-gateway.js'
import { runExtraction } from '../services/extraction.js'

const chat = new Hono()

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'

chat.post('/:id/chat', async (c) => {
  const id = z.string().uuid().parse(c.req.param('id'))
  const body = z.object({ content: z.string().min(1).max(8000) }).parse(await c.req.json())

  const apiKey = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!apiKey) return c.json({ error: '缺少 Authorization（LLM API Key）' }, 401)
  const baseUrl = c.req.header('X-LLM-Base-URL') || DEFAULT_BASE_URL
  const modelOverride = c.req.header('X-LLM-Model') || undefined

  // 会话必须存在
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1)
  if (!conv) return c.json({ error: '会话不存在' }, 404)

  return streamSSE(c, async (stream) => {
    const send = (event: string, data: unknown) =>
      stream.writeSSE({ event, data: JSON.stringify(data) })

    try {
      // 1. 持久化用户消息
      const nextIndex = conv.turnCount
      const [userMsg] = await db
        .insert(messages)
        .values({
          conversationId: id,
          role: 'user',
          content: body.content,
          turnIndex: nextIndex,
        })
        .returning()
      await db
        .update(conversations)
        .set({ turnCount: nextIndex + 1, updatedAt: new Date() })
        .where(eq(conversations.id, id))

      // 2. 装配七层 Context（trace 用于可观测与 M6 评测）
      const { llmMessages, trace } = await assembleContext(id, body.content)

      // 3. 流式调用 LLM
      const result = await chatStream(
        { baseUrl, apiKey, modelOverride, tier: 'chat', messages: llmMessages },
        (text) => send('delta', { text }),
      )

      // 4. 持久化助手消息（meta 携带本轮 Context Trace）
      const [assistantMsg] = await db
        .insert(messages)
        .values({
          conversationId: id,
          role: 'assistant',
          content: result.text,
          turnIndex: nextIndex + 1,
          meta: {
            trace: { ...trace, llm: { model: result.model, retries: result.retries, elapsedMs: result.elapsedMs } },
          },
        })
        .returning()
      await db
        .update(conversations)
        .set({ turnCount: nextIndex + 2, updatedAt: new Date() })
        .where(eq(conversations.id, id))

      await send('done', {
        userMessageId: userMsg.id,
        assistantMessageId: assistantMsg.id,
        trace: trace.layers.filter((l) => l.injected).map((l) => l.layer),
      })

      // 5. M3：Turn 级记忆提取（异步不阻塞聊天流；失败记入 meta，不静默丢失）
      //    聊天流已结束，这里沿用本次请求的 LLM 凭证做后台提取
      void runExtraction(
        id,
        userMsg.id,
        body.content,
        assistantMsg.id,
        result.text,
        { baseUrl, apiKey },
      ).catch((e) => console.error('[chat] 记忆提取任务异常:', e))
    } catch (err) {
      console.error('[chat] 聊天失败:', err)
      await send('error', { message: err instanceof Error ? err.message : '未知错误' })
    }
  })
})

export default chat
