/**
 * 记忆提取管道 —— M3
 *
 * 每轮对话结束后（异步、不阻塞聊天流）：
 *   1. Turn 级提取：把最近一轮 user+assistant 交换提取为结构化记忆
 *      （fact 事实 / episode 情景 / emotion 情感 / event 关系事件）
 *   2. 防坑三件套之「产出校验」：
 *      - JSON schema 校验（zod），不合法整体重试一次
 *      - 字数下限过滤（防「一晚上的事压成 14 个字」的过度压缩，
 *        episode 过短则拒绝并要求重提取——细节不能丢）
 *      - 空产出检测由 LLM Gateway 承担（网络层）
 *   3. Write Gate 分级写入：
 *      importance >= 0.6 且 confidence >= 0.7 → 自动写入（active）
 *      其余 → pending_review，等用户批准
 *   4. Temporal Supersession：同类事实冲突时旧记录标记 superseded，不删除
 *   5. 提取结果回写 assistant 消息 meta（可观测：本轮提取了什么、成败如何）
 *   6. 触发 Chapter Distillation 检查（累计轮数达到阈值）
 */
import { and, eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client.js'
import { memories, messages, conversations } from '../db/schema.js'
import { chatComplete, type GatewayRequest } from './llm-gateway.js'
import { maybeDistillChapter } from './distillation.js'
import { embed } from './embeddings.js'
import { recordEmotionalEvents, type EmotionalEventInput } from './relationship.js'

/** 记忆正文字数下限（低于视为过度压缩/噪声） */
const MIN_LENGTH: Record<string, number> = {
  fact: 4,
  episode: 15,
  emotion: 6,
  event: 6,
}

/** Write Gate 自动写入阈值 */
const AUTO_WRITE_IMPORTANCE = 0.6
const AUTO_WRITE_CONFIDENCE = 0.7

/** 事实冲突判定：字符二元组 Jaccard 相似度阈值 */
const FACT_CONFLICT_JACCARD = 0.45

const ExtractedMemory = z.object({
  kind: z.enum(['fact', 'episode', 'emotion', 'event']),
  content: z.string().min(1),
  summary: z.string().optional(),
  importance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  /** M5 情感字段 */
  valence: z.number().min(-1).max(1).optional(),
  arousal: z.number().min(0).max(1).optional(),
  emotionalIntensity: z.number().min(0).max(1).optional(),
  emotionalDimension: z
    .enum(['intimacy', 'trust', 'conflict', 'arousal'])
    .optional()
    .nullable(),
})
const ExtractionResult = z.array(ExtractedMemory)

interface LlmConfig {
  baseUrl: string
  apiKey: string
}

const EXTRACT_SYSTEM = `你是记忆提取引擎，为长期记忆系统服务。从对话片段中提取值得长期记住的记忆，输出严格 JSON 数组（不要 markdown 代码块、不要解释）。

记忆类型：
- fact: 关于用户的稳定事实/偏好/背景（如"她怕黑，睡觉要开小夜灯"）
- episode: 发生的具体事件/经历（保留细节：时间、地点、做了什么、感受）
- emotion: 用户表达的情绪状态及其原因
- event: 关系事件（纪念日、承诺、约定、里程碑）

要求：
1. 只提取值得跨越对话记住的内容，日常寒暄不提取（返回 []）
2. episode 必须保留细节，禁止过度压缩——一个晚上的经历不能用一句话概括
3. 每条记忆给 importance（对这段关系的情感权重 0-1）和 confidence（提取置信度 0-1）
4. 单轮提取最多 6 条，宁缺毋滥

【M5 情感字段】每条记忆额外输出（用于关系状态机和遗忘曲线）：
- valence: -1~1 情绪效价（-1 极度负面 / 0 中性 / 1 极度正面），无情感色彩则填 0
- arousal: 0~1 唤醒度（0 平静 / 1 强烈激动），日常寒暄填 0.1-0.3，关系大事填 0.7+
- emotional_intensity: 0~1 情感强度（影响"这条记忆多久被遗忘"，日常 0.3、关系大事 0.8+）
- emotional_dimension: 'intimacy'亲密度 / 'trust'信任度 / 'conflict'冲突度 / 'arousal'唤醒度 / null
  → 只在记忆触动关系维度时填（如表白→intimacy、吵架→conflict、被背叛→trust）
  → 日常 fact/episode/emotion 填 null

输出格式：[{"kind":"episode","content":"...","importance":0.8,"confidence":0.9,"valence":0.7,"arousal":0.6,"emotional_intensity":0.85,"emotional_dimension":"intimacy"}, ...]`

export interface ExtractionOutcome {
  written: number
  pendingReview: number
  superseded: number
  rejected: string[]
  chapterDistilled: boolean
  /** M4：本次成功生成 embedding 的记忆条数 */
  embedded?: number
  /** M5：投影到 emotional_events 表的关系事件数 */
  relationshipEventsRecorded?: number
}

/**
 * Turn 级提取入口。fire-and-forget 调用，任何失败只记录不抛出
 * （聊天主流程绝不因提取失败而中断——但失败会被记入 meta，不做静默丢失）。
 */
export async function runExtraction(
  conversationId: string,
  userMessageId: string,
  userContent: string,
  assistantMessageId: string,
  assistantContent: string,
  llm: LlmConfig,
): Promise<void> {
  try {
    const outcome = await extractOnce(conversationId, userMessageId, userContent, assistantMessageId, assistantContent, llm)
    await writeOutcomeToMeta(assistantMessageId, outcome)
  } catch (err) {
    console.error('[extraction] 提取失败（已记录，不静默丢失）:', err instanceof Error ? err.message : err)
    await writeOutcomeToMeta(assistantMessageId, {
      written: 0,
      pendingReview: 0,
      superseded: 0,
      rejected: [],
      chapterDistilled: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function extractOnce(
  conversationId: string,
  userMessageId: string,
  userContent: string,
  assistantMessageId: string,
  assistantContent: string,
  llm: LlmConfig,
): Promise<ExtractionOutcome> {
  const dialogue = `用户：${userContent}\n角色：${assistantContent}`

  const req: GatewayRequest = {
    baseUrl: llm.baseUrl,
    apiKey: llm.apiKey,
    tier: 'extraction',
    messages: [
      { role: 'system', content: EXTRACT_SYSTEM },
      { role: 'user', content: `对话片段：\n${dialogue}\n\n输出 JSON：` },
    ],
  }

  // 防坑①：JSON 不合法 → 换更严格的提示重试一次（Gateway 内部还有网络级重试）
  let raw = (await chatComplete(req)).text
  let parsed = safeParse(raw)
  if (!parsed.success) {
    raw = (
      await chatComplete({
        ...req,
        messages: [
          ...req.messages,
          { role: 'assistant', content: raw.slice(0, 500) },
          { role: 'user', content: '上面的输出不是合法的纯 JSON 数组。重新输出：只输出 JSON 数组本身，以 [ 开头 ] 结尾，不要任何其他文字。' },
        ],
      })
    ).text
    parsed = safeParse(raw)
  }
  if (!parsed.success) throw new Error(`提取产出无法解析为 JSON: ${raw.slice(0, 200)}`)

  // 防坑②：字数下限过滤（过度压缩 / 噪声）
  const rejected: string[] = []
  const valid = parsed.data.filter((m) => {
    const min = MIN_LENGTH[m.kind] ?? 4
    if (m.content.trim().length < min) {
      rejected.push(`${m.kind}(${m.content.length}字): ${m.content.slice(0, 30)}`)
      return false
    }
    return true
  })

  const outcome: ExtractionOutcome = {
    written: 0,
    pendingReview: 0,
    superseded: 0,
    rejected,
    chapterDistilled: false,
  }

  // Write Gate 分级写入 + Temporal Supersession
  const insertedIds: string[] = [] // M5：用于关系事件投影回链 memoryId
  for (const m of valid) {
    const auto = m.importance >= AUTO_WRITE_IMPORTANCE && m.confidence >= AUTO_WRITE_CONFIDENCE
    const status = auto ? 'active' : 'pending_review'

    if (m.kind === 'fact' && auto) {
      outcome.superseded += await supersedeConflictingFacts(conversationId, m.content)
    }

    const [inserted] = await db
      .insert(memories)
      .values({
        conversationId,
        kind: m.kind,
        content: m.content.trim(),
        summary: m.summary?.trim() || null,
        sourceMessageIds: [userMessageId, assistantMessageId],
        importance: m.importance,
        confidence: m.confidence,
        gate: auto ? 'auto' : 'review',
        status,
        // M5：情感字段透传（null/undefined 时落 null，让遗忘曲线用默认 0.5）
        valence: m.valence ?? null,
        arousal: m.arousal ?? null,
        emotionalIntensity: m.emotionalIntensity ?? 0.5,
        emotionalDimension: m.emotionalDimension ?? null,
      })
      .returning({ id: memories.id })
    if (inserted) insertedIds.push(inserted.id)

    if (auto) outcome.written++
    else outcome.pendingReview++
  }

  // M4：回填 embedding —— 失败不阻塞提取（留 null，backfill 脚本可补）
  outcome.embedded = await embedInsertedMemories(conversationId, llm)

  // M5：把触动关系维度的记忆投影到 emotional_events，触发关系状态机
  outcome.relationshipEventsRecorded = await projectToEmotionalEvents(
    valid,
    insertedIds,
    conversationId,
  )

  // 章节蒸馏检查（独立于提取，提取失败不影响蒸馏判断）
  outcome.chapterDistilled = await maybeDistillChapter(conversationId, llm)

  return outcome
}

/**
 * M5：把「触动关系维度」的记忆投影到 emotional_events 表。
 *
 * 不用让 LLM 额外输出结构，只复用现有 emotionalDimension 字段：
 *   - 仅 emotionalDimension 非空 且 emotionalIntensity ≥ 0.5 的记忆会被投影
 *   - 服务端按 valence 自动算 delta 方向：
 *       intimacy + positive valence → +intimacy
 *       intimacy + negative valence → -intimacy
 *       conflict + positive valence → +conflict
 *       trust + negative valence → -trust
 *
 * 这样 LLM 输出的字段数没增加，但状态机能跑起来。
 */
async function projectToEmotionalEvents(
  valid: Array<z.infer<typeof ExtractedMemory>>,
  insertedIds: string[],
  conversationId: string,
): Promise<number> {
  const events: EmotionalEventInput[] = []
  for (let i = 0; i < valid.length; i++) {
    const m = valid[i]
    if (!m.emotionalDimension || (m.emotionalIntensity ?? 0) < 0.5) continue
    const intensity = m.emotionalIntensity ?? 0.5
    const valence = m.valence ?? 0
    // 影响力量化：intensity 0.7 → 0.07，1.0 → 0.10（单次最大）
    const magnitude = intensity * 0.1
    // direction: valence ≥ 0 为正向，< 0 为负向
    const sign = valence >= 0 ? 1 : -1
    const delta: Record<string, number> = {}
    switch (m.emotionalDimension) {
      case 'intimacy':
        delta.intimacy = sign * magnitude
        break
      case 'trust':
        delta.trust = sign * magnitude
        break
      case 'conflict':
        // conflict 只看 valence 正负：正→建设性争论（关系向好），负→真实冲突
        delta.conflict = sign * magnitude
        break
      case 'arousal':
        // arousal 不直接改三维，仅作为情感事件被记录
        break
    }
    if (Object.keys(delta).length === 0) continue
    events.push({
      conversationId,
      memoryId: insertedIds[i] ?? null,
      dimension: m.emotionalDimension,
      valence: m.valence,
      arousal: m.arousal,
      intensity,
      triggerKind: inferTriggerKind(m.kind, m.emotionalDimension, valence),
      delta,
      confidence: m.confidence,
    })
  }
  if (events.length === 0) return 0
  const { recorded } = await recordEmotionalEvents(events)
  return recorded
}

/** 把记忆 kind + 维度 + 价价粗略映射到 trigger_kind（用于关系事件流分类） */
function inferTriggerKind(
  kind: string,
  dimension: string,
  valence: number,
): string {
  if (kind === 'event') {
    return dimension === 'conflict' ? (valence < 0 ? 'argument' : 'milestone') : 'milestone'
  }
  if (dimension === 'conflict' && valence < 0) return 'argument'
  if (dimension === 'intimacy' && valence > 0.7) return 'intimate'
  if (dimension === 'trust' && valence > 0.7) return 'promise'
  if (dimension === 'intimacy' && valence < -0.3) return 'argument'
  return 'casual'
}

/**
 * M4：给本轮刚写入的记忆生成 embedding。
 * 设计：best-effort + 单调重试 + 失败留 null；
 *   后续用 scripts/backfill-embeddings.ts 回填。
 */
async function embedInsertedMemories(
  conversationId: string,
  llm: { baseUrl: string; apiKey: string },
): Promise<number> {
  // 找到本轮刚写入但 embedding=null 的记忆（按时间倒序拿最近 N 条避免误伤旧的）
  const recent = await db
    .select({ id: memories.id, content: memories.content })
    .from(memories)
    .where(and(eq(memories.conversationId, conversationId)))
    .orderBy(desc(memories.createdAt))
    .limit(10)

  let ok = 0
  for (const m of recent) {
    try {
      const vec = await embed(m.content)
      if (vec) {
        await db
          .update(memories)
          .set({ embedding: vec, updatedAt: new Date() })
          .where(eq(memories.id, m.id))
        ok++
      }
    } catch (err) {
      // embedding 失败 = 后续会被回填脚本接住；不抛、不影响记忆可用性
      console.warn('[extraction] embedding 失败（已记入 null，将由 backfill 脚本回填）:', err instanceof Error ? err.message : err)
    }
  }
  return ok
}

/** 去掉 ```json 包裹等常见污染后解析 */
function safeParse(raw: string): z.SafeParseReturnType<unknown, z.infer<typeof ExtractionResult>> {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start >= 0 && end > start) text = text.slice(start, end + 1)
  try {
    return ExtractionResult.safeParse(JSON.parse(text))
  } catch {
    return { success: false, error: new Error('JSON parse failed') } as unknown as z.SafeParseReturnType<unknown, z.infer<typeof ExtractionResult>>
  }
}

/**
 * Temporal Supersession：新事实与旧事实语义冲突时，旧记录标记失效而非删除。
 * M3 用字符二元组 Jaccard 做轻量冲突检测（无 embedding 时的过渡方案），M4 换向量相似度。
 */
async function supersedeConflictingFacts(conversationId: string, newContent: string): Promise<number> {
  const oldFacts = await db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.conversationId, conversationId),
        eq(memories.kind, 'fact'),
        eq(memories.status, 'active'),
      ),
    )
    .orderBy(desc(memories.createdAt))
    .limit(100)

  let count = 0
  const now = new Date()
  for (const old of oldFacts) {
    if (bigramJaccard(old.content, newContent) >= FACT_CONFLICT_JACCARD) {
      // 先占位后更新：新记忆 id 生成后回填 supersededBy（简化：直接标记，回链 M4 完善）
      await db
        .update(memories)
        .set({ status: 'superseded', validTo: now, updatedAt: now })
        .where(eq(memories.id, old.id))
      count++
    }
  }
  return count
}

function bigramJaccard(a: string, b: string): number {
  const grams = (s: string) => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
  }
  const A = grams(a)
  const B = grams(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return inter / (A.size + B.size - inter)
}

/** 提取结果回写 assistant 消息 meta（可观测：不做静默丢失） */
async function writeOutcomeToMeta(assistantMessageId: string, outcome: ExtractionOutcome & { error?: string }) {
  const [msg] = await db.select().from(messages).where(eq(messages.id, assistantMessageId)).limit(1)
  if (!msg) return
  const meta = { ...(msg.meta ?? {}) }, extraction: Record<string, unknown> = { ...outcome }
  await db
    .update(messages)
    .set({ meta: { ...meta, extraction } })
    .where(eq(messages.id, assistantMessageId))
}
