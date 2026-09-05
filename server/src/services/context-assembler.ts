/**
 * Context 装配器 —— M2
 *
 * 七层 Context 模型（自上而下注入，位置固定、预算固定）：
 *   L0 Persona      人设卡（conversation.systemPrompt）        常驻
 *   L1 Relationship 关系状态（亲密度/阶段/天气）               常驻   【M5 实现】
 *   L2 Ongoing      当前进行中的事（话题/承诺）                  常驻   【M5 实现】
 *   L3 Recent       近期对话原文（滚动窗口）                     常驻
 *   L4 Summary      章节摘要（Chapter Distillation）           按需   【M3 实现】
 *   L5 Retrieved    检索命中的长期记忆（混合检索）              按需   【M4 实现】
 *   L6 Lore         世界书/设定补充（World Info）               按需   【M6 实现】
 *
 * 核心思想（来源：个人开发者实测 + MemGPT/Stanford 生成式 Agent）：
 *   记忆从「被模型调用」变成「被装配器带入」—— 每轮请求前确定性地组装 prompt，
 *   不依赖模型自觉调工具，注入位置和 token 预算固定，行为可复现、可观测。
 */

import { desc, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { chapters, conversations, messages } from '../db/schema.js'
import { searchMemories } from './retrieval.js'
import {
  getRecentEmotionalEvents,
  getRelationshipState,
} from './relationship.js'

/** 各层字符预算（粗算 1 token ≈ 1.5 汉字，预算即软上限，超出截断） */
export const LAYER_BUDGET = {
  persona: 3000,
  relationship: 600,
  ongoing: 600,
  summary: 2000,
  retrieved: 2000,
  lore: 1000,
  recent: 6000,
} as const

/** 近期窗口条数（user+assistant 合计） */
const RECENT_WINDOW = 24

/** L4 摘要层注入的章节数（最新的在后） */
const SUMMARY_CHAPTER_COUNT = 3

export interface ContextLayer {
  /** 层标识 */
  layer: 'persona' | 'relationship' | 'ongoing' | 'summary' | 'retrieved' | 'lore'
  /** 本层实际注入的文本（null = 本轮无内容） */
  content: string | null
  /** 来源描述，写入 trace 用于可观测 */
  source: string
}

export interface ContextTrace {
  /** 每层注入情况 */
  layers: Array<{ layer: string; chars: number; source: string; injected: boolean }>
  /** 近期窗口覆盖的 message id */
  recentMessageIds: string[]
  /** 总装配字符数 */
  totalChars: number
  /** 装配耗时 ms */
  elapsedMs: number
  /** 装配器版本（评测对比用） */
  version: string
  /** L5 检索命中明细（M6：用于 Trace 面板可视化） */
  retrievedItems?: Array<{
    id: string
    kind: 'fact' | 'episode' | 'emotion' | 'event'
    content: string
    importance: number
    score: number
    source: 'vector' | 'text' | 'both'
  }>
  /** L5 检索 trace（M6：用于显示通道命中数等可观测数据） */
  retrievalStats?: { hits: number; durationMs: number; vectorEnabled: boolean }
}

export interface AssembledContext {
  /** 发给 LLM 的完整 messages（system + 窗口 + 当前用户输入） */
  llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  trace: ContextTrace
}

function clip(text: string, budget: number): string {
  if (text.length <= budget) return text
  return text.slice(0, budget) + '\n(内容过长已截断)'
}

/** 压缩换行，保持层内容紧凑 */
function compact(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

export async function assembleContext(
  conversationId: string,
  userMessage: string,
): Promise<AssembledContext> {
  const started = Date.now()

  // ---- 会话元信息（人设层） ----
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)

  const layers: ContextLayer[] = []

  // L0 Persona：会话创建时由前端写入，服务端成为人设的唯一事实来源
  layers.push({
    layer: 'persona',
    content: conv?.systemPrompt
      ? clip(compact(conv.systemPrompt), LAYER_BUDGET.persona)
      : null,
    source: 'conversation.system_prompt',
  })

  // L1 Relationship：当前关系快照 + 最近 N 条关系事件
  //   失败时降级为 null（不阻塞对话流）
  let relationshipText: string | null = null
  let relationshipSource = 'relationship_state[M5,empty]'
  try {
    const state = await getRelationshipState(conversationId)
    const recentEvents = await getRecentEmotionalEvents(conversationId, 3)
    const phaseLabel: Record<string, string> = {
      initial: '初始期',
      warming: '升温期',
      intimate: '亲密期',
      conflicted: '冲突中',
      distant: '疏远期',
    }
    const lines: string[] = [
      `当前阶段：${phaseLabel[state.phase]}`,
      `亲密度 ${state.intimacy.toFixed(2)} ｜ 信任度 ${state.trust.toFixed(2)} ｜ 冲突度 ${state.conflict.toFixed(2)}`,
    ]
    if (recentEvents.length > 0) {
      lines.push('最近的关系变化：')
      for (const ev of recentEvents) {
        const sign = (n: number) => (n > 0 ? '+' : '')
        const d: string[] = []
        if (typeof ev.delta.intimacy === 'number') d.push(`亲密度${sign(ev.delta.intimacy)}${ev.delta.intimacy.toFixed(2)}`)
        if (typeof ev.delta.trust === 'number') d.push(`信任度${sign(ev.delta.trust)}${ev.delta.trust.toFixed(2)}`)
        if (typeof ev.delta.conflict === 'number') d.push(`冲突度${sign(ev.delta.conflict)}${ev.delta.conflict.toFixed(2)}`)
        lines.push(`- [${ev.triggerKind}] ${d.join(' / ')}`)
      }
    }
    relationshipText = lines.join('\n')
    relationshipSource = `relationship_state[M5,phase=${state.phase},v=${state.version}]`
  } catch (err) {
    console.warn('[context-assembler] 关系快照读取失败:', err instanceof Error ? err.message : err)
  }

  // L2 Ongoing：进行中的事（话题/承诺/未解决）—— 取最近 24h 内重要性高的 event 类记忆
  let ongoingText: string | null = null
  let ongoingSource = 'ongoing_topics[M5,empty]'
  try {
    const ongoingRows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.turnIndex))
      .limit(80)
    // 用最近章节摘要 + 最近 event 类记忆拼出「进行中」概览
    const recentChapter = (await db
      .select()
      .from(chapters)
      .where(eq(chapters.conversationId, conversationId))
      .orderBy(desc(chapters.chapterIndex))
      .limit(1)) ?? []
    const chapterHint = recentChapter[0]?.summary ?? ''
    if (chapterHint) {
      ongoingText = chapterHint.split('\n').slice(0, 5).join('\n')
      ongoingSource = `chapter_tail[M3,ch${recentChapter[0]?.chapterIndex}]`
    } else if (ongoingRows.length > 0) {
      ongoingText = `本会话已累计 ${ongoingRows.length} 条消息，继续当前话题。`
      ongoingSource = `fallback[M5,${ongoingRows.length}msg]`
    }
    void ongoingRows // 避免 lint 警告（未来可改用更精准的 event 过滤）
  } catch (err) {
    console.warn('[context-assembler] Ongoing 装配失败:', err instanceof Error ? err.message : err)
  }

  layers.push({
    layer: 'relationship',
    content: relationshipText ? clip(compact(relationshipText), LAYER_BUDGET.relationship) : null,
    source: relationshipSource,
  })
  layers.push({
    layer: 'ongoing',
    content: ongoingText ? clip(compact(ongoingText), LAYER_BUDGET.ongoing) : null,
    source: ongoingSource,
  })

  // L3 Recent：近期窗口原文（从旧到新）
  const recentRows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.turnIndex))
    .limit(RECENT_WINDOW)

  // L4 Summary：最近 N 章章节摘要（Chapter Distillation 产出，M3）
  const chapterRows = await db
    .select()
    .from(chapters)
    .where(eq(chapters.conversationId, conversationId))
    .orderBy(desc(chapters.chapterIndex))
    .limit(SUMMARY_CHAPTER_COUNT)
  const chapterSummary = chapterRows
    .slice()
    .reverse()
    .map((ch) => ch.summary)
    .join('\n')

  // L5 Retrieved：M4 混合检索（向量 + 全文 + 时间衰减 + RRF 融合 + importance 加权）
  //   - 失败时降级为空字符串（不阻塞对话流）
  //   - 检索不到任何东西时返回 null（不浪费 prompt 预算）
  let retrievedText: string | null = null
  let retrievedItems: Array<{
    id: string
    kind: 'fact' | 'episode' | 'emotion' | 'event'
    content: string
    importance: number
    score: number
    source: 'vector' | 'text' | 'both'
  }> = []
  let retrievalTrace: { hits: number; durationMs: number; vectorEnabled: boolean } | null = null
  try {
    const { items, trace } = await searchMemories(userMessage, conversationId)
    retrievalTrace = {
      hits: items.length,
      durationMs: trace.durationMs,
      vectorEnabled: trace.embeddingAvailable,
    }
    if (items.length > 0) {
      retrievedText = items
        .map((m) => `[${m.kind}] ${m.content}`)
        .join('\n')
      retrievedItems = items.map((m) => ({
        id: m.id,
        kind: m.kind,
        content: m.content,
        importance: m.importance,
        score: m.score,
        source: m.source,
      }))
    }
  } catch (err) {
    console.warn('[context-assembler] 检索失败（已降级为空）:', err instanceof Error ? err.message : err)
  }

  layers.push({
    layer: 'summary',
    content: chapterSummary ? clip(compact(chapterSummary), LAYER_BUDGET.summary) : null,
    source: `chapter_summaries[M3,${chapterRows.length}ch]`,
  })
  layers.push({
    layer: 'retrieved',
    content: retrievedText ? clip(compact(retrievedText), LAYER_BUDGET.retrieved) : null,
    source: retrievalTrace
      ? `hybrid_retrieval[M4,${retrievalTrace.hits}hit/${retrievalTrace.durationMs}ms,vec=${retrievalTrace.vectorEnabled}]`
      : 'hybrid_retrieval[M4,unavailable]',
  })
  layers.push({ layer: 'lore', content: null, source: 'world_info[M6]' })

  // ---- 组装 system prompt：固定顺序、固定区块标题 ----
  const sections: string[] = []
  for (const layer of layers) {
    if (!layer.content) continue
    const header: Record<ContextLayer['layer'], string> = {
      persona: '【你是谁】',
      relationship: '【你们的关系现状】',
      ongoing: '【最近在发生的事】',
      summary: '【你们经历过的事（摘要）】',
      retrieved: '【相关回忆】',
      lore: '【设定补充】',
    }
    sections.push(`${header[layer.layer]}\n${layer.content}`)
  }
  const systemPrompt = sections.join('\n\n')

  // ---- 近期窗口（正序）----
  const recent = recentRows.slice().reverse()
  let recentChars = 0
  const windowMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  // 从最新往回收，保证最贴近当前对话的原文优先保留在预算内
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i]
    if (recentChars + m.content.length > LAYER_BUDGET.recent && windowMessages.length > 0) break
    if (m.role === 'user' || m.role === 'assistant') {
      windowMessages.unshift({ role: m.role, content: m.content })
      recentChars += m.content.length
    }
  }

  const trace: ContextTrace = {
    layers: layers.map((l) => ({
      layer: l.layer,
      chars: l.content?.length ?? 0,
      source: l.source,
      injected: !!l.content,
    })),
    recentMessageIds: windowMessages.length ? recent.slice(-windowMessages.length).map((m) => m.id) : [],
    totalChars: systemPrompt.length + recentChars + userMessage.length,
    elapsedMs: Date.now() - started,
    version: 'ctx-assembler/0.5',
    retrievedItems: retrievedItems.length > 0 ? retrievedItems : undefined,
    retrievalStats: retrievalTrace ?? undefined,
  }

  return {
    llmMessages: [
      { role: 'system', content: systemPrompt || '你是一个温暖的陪伴者。' },
      ...windowMessages,
      { role: 'user', content: userMessage },
    ],
    trace,
  }
}
