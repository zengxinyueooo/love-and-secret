import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { conversations, messages } from '../db/schema.js'

const app = new Hono()

/**
 * 获取会话的全部消息（按 turnIndex 升序）
 * ?after=<turnIndex> 增量拉取
 */
app.get('/:id/messages', async (c) => {
  const id = z.string().uuid().parse(c.req.param('id'))
  const after = z.coerce.number().int().nonnegative().optional()
  const afterIdx = after.safeParse(c.req.query('after')).data

  const rows = await db
    .select()
    .from(messages)
    .where(
      afterIdx === undefined
        ? eq(messages.conversationId, id)
        : and(
            eq(messages.conversationId, id),
            gt(messages.turnIndex, afterIdx),
          ),
    )
    .orderBy(asc(messages.turnIndex))

  return c.json(rows)
})

/**
 * 追加消息（M2 起由后端在 LLM 响应后自动写入，M1 供前端直写）
 */
app.post(
  '/:id/messages',
  zValidator(
    'json',
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1).max(50_000),
    }),
  ),
  async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'))
    const { role, content } = c.req.valid('json')

    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
    if (!conv) return c.json({ error: '会话不存在' }, 404)

    const [{ nextIndex }] = await db
      .select({
        nextIndex: sql<number>`coalesce(max(${messages.turnIndex}) + 1, 0)`,
      })
      .from(messages)
      .where(eq(messages.conversationId, id))

    const [row] = await db
      .insert(messages)
      .values({ conversationId: id, role, content, turnIndex: nextIndex })
      .returning()

    // 轮数与活跃时间由 message 派生，保证一致性
    await db
      .update(conversations)
      .set({
        turnCount: sql`case when ${conversations.turnCount} < ${
          Math.floor(nextIndex / 2) + 1
        } then ${
          Math.floor(nextIndex / 2) + 1
        } else ${conversations.turnCount} end`,
        updatedAt: sql`now()`,
      })
      .where(eq(conversations.id, id))

    return c.json(row, 201)
  },
)

export default app
