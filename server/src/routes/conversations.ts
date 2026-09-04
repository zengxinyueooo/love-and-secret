import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { conversations } from '../db/schema.js'

const app = new Hono()

/** 列出所有会话（最近活跃在前） */
app.get('/', async (c) => {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
  return c.json(rows)
})

/** 新建会话 */
app.post(
  '/',
  zValidator(
    'json',
    z.object({
      title: z.string().max(200).optional(),
      personaId: z.string().max(100).optional(),
      systemPrompt: z.string().max(20000).optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')
    const [row] = await db
      .insert(conversations)
      .values({
        title: body.title ?? '新的对话',
        personaId: body.personaId,
        systemPrompt: body.systemPrompt,
      })
      .returning()
    return c.json(row, 201)
  },
)

/** 获取单个会话 */
app.get('/:id', async (c) => {
  const id = z.string().uuid().parse(c.req.param('id'))
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
  if (!row) return c.json({ error: '会话不存在' }, 404)
  return c.json(row)
})

/** 更新会话（改名/换角色） */
app.patch(
  '/:id',
  zValidator(
    'json',
    z.object({
      title: z.string().min(1).max(200).optional(),
      personaId: z.string().max(100).optional(),
      systemPrompt: z.string().max(20000).optional(),
    }),
  ),
  async (c) => {
    const id = z.string().uuid().parse(c.req.param('id'))
    const body = c.req.valid('json')
    const [row] = await db
      .update(conversations)
      .set({ ...body, updatedAt: sql`now()` })
      .where(eq(conversations.id, id))
      .returning()
    if (!row) return c.json({ error: '会话不存在' }, 404)
    return c.json(row)
  },
)

/** 删除会话（级联删除消息，M3 起记忆也级联） */
app.delete('/:id', async (c) => {
  const id = z.string().uuid().parse(c.req.param('id'))
  const [row] = await db
    .delete(conversations)
    .where(eq(conversations.id, id))
    .returning()
  if (!row) return c.json({ error: '会话不存在' }, 404)
  return c.json({ ok: true })
})

export default app
