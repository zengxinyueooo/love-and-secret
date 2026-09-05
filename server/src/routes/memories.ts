/**
 * 记忆管理路由 —— M3
 *
 * GET  /api/memories?conversationId=&status=&kind=   列表（Write Gate 待审队列从这里看）
 * PATCH /api/memories/:id  { action: 'approve' | 'reject' | 'edit', content? }
 * DELETE /api/memories/:id
 */
import { Hono } from 'hono'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { memories } from '../db/schema.js'

const memoriesRoute = new Hono()

memoriesRoute.get('/', async (c) => {
  const conversationId = z.string().uuid().optional().parse(c.req.query('conversationId') || undefined)
  const status = z.enum(['active', 'pending_review', 'rejected', 'superseded']).optional().parse(c.req.query('status') || undefined)
  const kind = z.enum(['fact', 'episode', 'emotion', 'event']).optional().parse(c.req.query('kind') || undefined)

  const conds: SQL[] = []
  if (conversationId) conds.push(eq(memories.conversationId, conversationId))
  if (status) conds.push(eq(memories.status, status))
  if (kind) conds.push(eq(memories.kind, kind))

  const rows = await db
    .select()
    .from(memories)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(memories.createdAt))
    .limit(500)

  return c.json(rows)
})

/** Write Gate 审批 + 人工编辑（human-in-the-loop） */
memoriesRoute.patch('/:id', async (c) => {
  const id = z.string().uuid().parse(c.req.param('id'))
  const body = z
    .object({
      action: z.enum(['approve', 'reject', 'edit']),
      content: z.string().min(1).max(2000).optional(),
    })
    .parse(await c.req.json())

  const [existing] = await db.select().from(memories).where(eq(memories.id, id)).limit(1)
  if (!existing) return c.json({ error: '记忆不存在' }, 404)

  const now = new Date()
  if (body.action === 'approve') {
    await db.update(memories).set({ status: 'active', updatedAt: now }).where(eq(memories.id, id))
  } else if (body.action === 'reject') {
    await db.update(memories).set({ status: 'rejected', updatedAt: now }).where(eq(memories.id, id))
  } else {
    if (!body.content) return c.json({ error: 'edit 需要 content' }, 400)
    await db
      .update(memories)
      .set({ content: body.content, updatedAt: now })
      .where(eq(memories.id, id))
  }

  const [updated] = await db.select().from(memories).where(eq(memories.id, id)).limit(1)
  return c.json(updated)
})

memoriesRoute.delete('/:id', async (c) => {
  const id = z.string().uuid().parse(c.req.param('id'))
  await db.delete(memories).where(eq(memories.id, id))
  return c.json({ ok: true })
})

export default memoriesRoute
