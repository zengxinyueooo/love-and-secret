/**
 * Chapter Distillation —— M3
 *
 * 每轮对话后检查：未蒸馏的累计轮数达到阈值（20-40 区间取 24），
 * 则把这段对话原文蒸馏成章节摘要，写入 chapters 表，供 L4 Summary 层注入。
 *
 * 为什么是 24：
 *   太短（<20）：蒸馏频繁，提取成本高且摘要碎片化
 *   太长（>40）：近期窗口滑出后到下次蒸馏之间存在「遗忘空窗」
 *   双重保险：轮数阈值 + 最后一条章节兜底（空窗期内 L4 至少有上一章可注入）
 */
import { asc, desc, eq, gt, and } from 'drizzle-orm'
import { db } from '../db/client.js'
import { chapters, conversations, messages } from '../db/schema.js'
import { chatComplete, type GatewayRequest } from './llm-gateway.js'

/** 每章覆盖的消息条数（user+assistant 各算一条，即 12 轮对话） */
export const CHAPTER_SIZE_MESSAGES = 24
/** 章节摘要字符预算（超长会被 L4 层截断） */
const SUMMARY_TARGET = '200-400 字'

const DISTILL_SYSTEM = `你是回忆录作者，为一段 AI 陪伴对话写章节摘要。

要求：
1. 用第三人称叙述"用户"和"角色"之间发生的事
2. 保留情感细节、重要承诺、约定、情绪变化——这些是回忆的核心，禁止压缩掉
3. 按时间顺序叙述，${SUMMARY_TARGET}，一段连贯的文字，不要列表
4. 只输出摘要本身，不要任何前后缀`

export async function maybeDistillChapter(conversationId: string, llm: { baseUrl: string; apiKey: string }): Promise<boolean> {
  // 最后一条章节的 endTurn
  const [lastChapter] = await db
    .select()
    .from(chapters)
    .where(eq(chapters.conversationId, conversationId))
    .orderBy(desc(chapters.endTurn))
    .limit(1)

  const lastEnd = lastChapter?.endTurn ?? -1

  const unchaptered = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), gt(messages.turnIndex, lastEnd)))
    .orderBy(asc(messages.turnIndex))
    .limit(CHAPTER_SIZE_MESSAGES + 1)

  // 未满一章不动
  if (unchaptered.length < CHAPTER_SIZE_MESSAGES) return false

  const slice = unchaptered.slice(0, CHAPTER_SIZE_MESSAGES)
  const dialogue = slice
    .map((m) => `${m.role === 'user' ? '用户' : '角色'}：${m.content}`)
    .join('\n')

  const req: GatewayRequest = {
    baseUrl: llm.baseUrl,
    apiKey: llm.apiKey,
    tier: 'extraction',
    messages: [
      { role: 'system', content: DISTILL_SYSTEM },
      { role: 'user', content: `以下是这章的对话原文：\n\n${dialogue}\n\n写出章节摘要：` },
    ],
  }

  const result = await chatComplete(req)
  const summary = result.text.trim()
  // 防坑：摘要过短视为蒸馏失败（过度压缩），下次再试
  if (summary.length < 60) throw new Error(`章节摘要过短(${summary.length}字)，疑似过度压缩，已放弃本次蒸馏`)

  await db.insert(chapters).values({
    conversationId,
    chapterIndex: (lastChapter?.chapterIndex ?? -1) + 1,
    startTurn: slice[0].turnIndex,
    endTurn: slice[slice.length - 1].turnIndex,
    summary,
    messageIds: slice.map((m) => m.id),
  })

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId))
  return true
}
