/**
 * 单会话导出端点 —— M7
 *
 * GET /api/conversations/:id/export?format=json|markdown
 *
 *   JSON    完整快照（conv + messages + memories + chapters + relationship）
 *   Markdown 人类可读：会话元信息 → 章节摘要 → 完整对话 → 提取的记忆
 *
 * 设计：服务端组装，前端直接下载 blob，省一次往返
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { asc, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  conversations,
  messages,
  memories as memoriesTbl,
  chapters as chaptersTbl,
  relationshipStates,
} from '../db/schema.js'

const exportRoute = new Hono()

const formatSchema = z.enum(['json', 'markdown'])

/** 中文友好转义（避免 Markdown 表格/标题被内容干扰） */
const mdEscape = (s: string): string =>
  s.replace(/([|`*_>#])/g, '\\$1').replace(/\n/g, ' ')

/** JSON 完整快照 */
async function buildJson(conversationId: string) {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId))
  if (!conv) return null

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.turnIndex))

  const mems = await db
    .select()
    .from(memoriesTbl)
    .where(eq(memoriesTbl.conversationId, conversationId))
    .orderBy(asc(memoriesTbl.createdAt))

  const chaps = await db
    .select()
    .from(chaptersTbl)
    .where(eq(chaptersTbl.conversationId, conversationId))
    .orderBy(asc(chaptersTbl.chapterIndex))

  const [rel] = await db
    .select()
    .from(relationshipStates)
    .where(eq(relationshipStates.conversationId, conversationId))

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: '1.0',
    conversation: conv,
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      turnIndex: m.turnIndex,
      createdAt: m.createdAt,
    })),
    memories: mems.map((m) => ({
      id: m.id,
      kind: m.kind,
      content: m.content,
      summary: m.summary,
      importance: m.importance,
      confidence: m.confidence,
      status: m.status,
      gate: m.gate,
      emotionalIntensity: m.emotionalIntensity,
      emotionalDimension: m.emotionalDimension,
      valence: m.valence,
      arousal: m.arousal,
      createdAt: m.createdAt,
    })),
    chapters: chaps,
    relationship: rel ?? null,
  }
}

/** Markdown：人类可读叙事 */
async function buildMarkdown(conversationId: string): Promise<string | null> {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId))
  if (!conv) return null

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.turnIndex))

  const mems = await db
    .select()
    .from(memoriesTbl)
    .where(eq(memoriesTbl.conversationId, conversationId))
    .orderBy(asc(memoriesTbl.createdAt))

  const chaps = await db
    .select()
    .from(chaptersTbl)
    .where(eq(chaptersTbl.conversationId, conversationId))
    .orderBy(asc(chaptersTbl.chapterIndex))

  const [rel] = await db
    .select()
    .from(relationshipStates)
    .where(eq(relationshipStates.conversationId, conversationId))

  const lines: string[] = []
  lines.push(`# ${conv.title}`)
  lines.push('')
  lines.push(`> 导出于 ${new Date().toLocaleString('zh-CN')}`)
  lines.push('')
  lines.push('## 会话信息')
  lines.push('')
  lines.push(`- 会话 ID：\`${conv.id}\``)
  lines.push(`- 创建时间：${conv.createdAt.toLocaleString('zh-CN')}`)
  lines.push(`- 对话轮数：${conv.turnCount}`)
  lines.push(`- 消息条数：${msgs.length}`)
  if (rel) {
    lines.push(
      `- 关系阶段：${rel.phase}（亲密度 ${rel.intimacy.toFixed(2)} / 信任 ${rel.trust.toFixed(2)} / 冲突 ${rel.conflict.toFixed(2)}）`,
    )
  }
  lines.push('')

  if (chaps.length > 0) {
    lines.push('## 章节摘要')
    lines.push('')
    for (const c of chaps) {
      lines.push(`### 第 ${c.chapterIndex} 段（第 ${c.startTurn}-${c.endTurn} 轮）`)
      lines.push('')
      lines.push(c.summary)
      lines.push('')
    }
  }

  lines.push('## 完整对话')
  lines.push('')
  for (const m of msgs) {
    const label = m.role === 'user' ? '🧑 我' : m.role === 'assistant' ? '💜 黎深' : '⚙️ 系统'
    lines.push(`**${label}** （第 ${m.turnIndex} 轮 · ${m.createdAt.toLocaleString('zh-CN')}）`)
    lines.push('')
    lines.push(m.content)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  if (mems.length > 0) {
    lines.push('## 提取的记忆')
    lines.push('')
    const kindLabels: Record<string, string> = {
      fact: '📌 事实',
      episode: '🎬 情景',
      emotion: '💗 情感',
      event: '🎉 事件',
    }
    for (const m of mems) {
      if (m.status === 'superseded' || m.status === 'rejected') continue
      lines.push(
        `- **${kindLabels[m.kind]}** （重要度 ${m.importance.toFixed(2)}${
          m.emotionalIntensity > 0
            ? ` / 情感强度 ${m.emotionalIntensity.toFixed(2)}`
            : ''
        }）：${m.summary || mdEscape(m.content).slice(0, 200)}`,
      )
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('_本文件由 love-and-secret 自动生成_')

  return lines.join('\n')
}

exportRoute.get('/:id/export', async (c) => {
  const id = z.string().uuid().safeParse(c.req.param('id'))
  if (!id.success) return c.json({ error: '无效的会话 ID' }, 400)
  const format = formatSchema.safeParse(c.req.query('format') || 'json')
  if (!format.success) return c.json({ error: 'format 必须是 json | markdown' }, 400)

  const [conv] = await db
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .where(eq(conversations.id, id.data))
  if (!conv) return c.json({ error: '会话不存在' }, 404)

  if (format.data === 'markdown') {
    const md = await buildMarkdown(id.data)
    if (!md) return c.json({ error: '会话不存在' }, 404)
    const filename = encodeURIComponent(`${conv.title}.md`)
    return c.body(md, 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    })
  }

  const json = await buildJson(id.data)
  if (!json) return c.json({ error: '会话不存在' }, 404)
  const filename = encodeURIComponent(`${conv.title}.json`)
  return c.body(JSON.stringify(json, null, 2), 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
  })
})

export default exportRoute