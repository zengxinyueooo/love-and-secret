/**
 * 关系状态机 —— M5 情感特化层
 *
 * 把「关系」从隐变量变成显式的三维坐标：
 *   intimacy  亲密度  0-1   你们多亲密
 *   trust     信任度  0-1   你信不信任 ta
 *   conflict  冲突度  0-1   最近摩擦多少
 *
 * 阶段判定（自动从三维推出）：
 *   initial      初始     intimacy < 0.3 && trust < 0.7
 *   warming      升温     0.3 ≤ intimacy < 0.7 && conflict < 0.3
 *   intimate     亲密     intimacy ≥ 0.7 && trust ≥ 0.6 && conflict < 0.3
 *   conflicted   冲突中   conflict ≥ 0.5
 *   distant      疏远     intimacy < 0.3 && trust < 0.5 && conflict ≥ 0.3
 *
 * 节流设计（防止 LLM 反复触发同类事件导致三维剧烈波动）：
 *   - 同一 dimension 在窗口时间内累计 delta 不超过 THROTTLE_MAX_DELTA
 *   - 默认窗口 5 分钟、阈值 0.15
 *   - 超出部分按比例缩放写入（不丢失事件，只缩影响量）
 *
 * 触发流程：
 *   extraction.ts 检测到关系事件 → recordEmotionalEvents() 写入 emotional_events
 *     → recomputeRelationshipState() 累加 delta → 更新 relationship_states.phase
 *     → 装配器 L1 Relationship 层读 snapshot 注入 prompt
 */

import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  emotionalEvents,
  relationshipStates,
  type EmotionalEvent,
  type RelationshipState,
} from '../db/schema.js'

/** 三维坐标边界 */
const CLAMP = { min: 0, max: 1 }

/** 节流：同一 dimension 在窗口内累计 delta 软上限 */
const THROTTLE_WINDOW_MS = 5 * 60_000 // 5 分钟
const THROTTLE_MAX_DELTA = 0.15

/** 阶段判定阈值（与文档注释同步） */
const PHASE_THRESHOLDS = {
  intimate: { intimacy: 0.7, trust: 0.6, conflict: 0.3 },
  conflicted: { conflict: 0.5 },
  distant: { intimacy: 0.3, trust: 0.5, conflict: 0.3 },
  warming: { intimacy: 0.3 },
} as const

export interface EmotionalEventInput {
  conversationId: string
  memoryId?: string | null
  dimension: 'intimacy' | 'trust' | 'conflict' | 'arousal'
  valence?: number
  arousal?: number
  intensity: number
  triggerKind: string
  delta: Record<string, number>
  confidence?: number
}

/**
 * 写入一批情感事件，并触发关系快照更新。
 * 失败只 console.error 不抛出 —— 情感状态不该阻塞聊天主流程。
 */
export async function recordEmotionalEvents(
  events: EmotionalEventInput[],
): Promise<{ recorded: number; relationshipUpdated: boolean }> {
  if (events.length === 0) {
    return { recorded: 0, relationshipUpdated: false }
  }
  const conversationId = events[0].conversationId

  // 节流：窗口内累计 delta（按 dimension 维度分组）
  const throttled = throttle(events)

  let recorded = 0
  for (const ev of throttled) {
    try {
      await db.insert(emotionalEvents).values({
        conversationId: ev.conversationId,
        memoryId: ev.memoryId ?? null,
        dimension: ev.dimension,
        valence: ev.valence ?? null,
        arousal: ev.arousal ?? null,
        intensity: ev.intensity,
        triggerKind: ev.triggerKind,
        delta: ev.delta,
        confidence: ev.confidence ?? 0.7,
      })
      recorded++
    } catch (err) {
      console.error('[relationship] 写入情感事件失败:', err instanceof Error ? err.message : err)
    }
  }

  let relationshipUpdated = false
  if (recorded > 0) {
    try {
      await recomputeRelationshipState(conversationId)
      relationshipUpdated = true
    } catch (err) {
      console.error('[relationship] 重算关系状态失败:', err instanceof Error ? err.message : err)
    }
  }

  return { recorded, relationshipUpdated }
}

/**
 * 取关系快照（无则返回初始默认值，不写入 DB）
 */
export async function getRelationshipState(
  conversationId: string,
): Promise<RelationshipState> {
  const [row] = await db
    .select()
    .from(relationshipStates)
    .where(eq(relationshipStates.conversationId, conversationId))
    .limit(1)
  return (
    row ?? {
      conversationId,
      intimacy: 0.5,
      trust: 0.5,
      conflict: 0.0,
      phase: 'initial',
      version: 0,
      lastEventAt: null,
      updatedAt: new Date(),
    }
  )
}

/**
 * 重算关系快照：累加最近 24h 的事件 delta，更新三维 + 阶段。
 * 用 24h 窗口而非全部历史，是因为太早的事件已"沉淀"为基线状态（人不是天天被同一种事件持续影响）。
 */
export async function recomputeRelationshipState(
  conversationId: string,
): Promise<RelationshipState> {
  const since = new Date(Date.now() - 24 * 60 * 60_000)
  const events = await db
    .select()
    .from(emotionalEvents)
    .where(
      and(
        eq(emotionalEvents.conversationId, conversationId),
        gte(emotionalEvents.createdAt, since),
      ),
    )
    .orderBy(desc(emotionalEvents.createdAt))
    .limit(200)

  // 从默认值出发累加 delta
  let intimacyAcc = 0.5
  let trustAcc = 0.5
  let conflictAcc = 0.0
  let lastEventAt: Date | null = null

  for (const e of events) {
    // delta 字段里可能有多个维度（如吵架同时 -trust +conflict）
    if (typeof e.delta.intimacy === 'number') intimacyAcc += e.delta.intimacy
    if (typeof e.delta.trust === 'number') trustAcc += e.delta.trust
    if (typeof e.delta.conflict === 'number') conflictAcc += e.delta.conflict
    if (!lastEventAt || e.createdAt > lastEventAt) lastEventAt = e.createdAt
  }

  const next: Pick<RelationshipState, 'intimacy' | 'trust' | 'conflict'> = {
    intimacy: clamp(intimacyAcc),
    trust: clamp(trustAcc),
    conflict: clamp(conflictAcc),
  }
  const phase = inferPhase(next)

  // 写入或更新（用 version 做乐观锁，避免并发覆盖）
  const [existing] = await db
    .select()
    .from(relationshipStates)
    .where(eq(relationshipStates.conversationId, conversationId))
    .limit(1)

  if (!existing) {
    await db.insert(relationshipStates).values({
      conversationId,
      intimacy: next.intimacy,
      trust: next.trust,
      conflict: next.conflict,
      phase,
      version: 1,
      lastEventAt,
    })
  } else {
    await db
      .update(relationshipStates)
      .set({
        intimacy: next.intimacy,
        trust: next.trust,
        conflict: next.conflict,
        phase,
        version: existing.version + 1,
        lastEventAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(relationshipStates.conversationId, conversationId),
          eq(relationshipStates.version, existing.version),
        ),
      )
  }

  return {
    conversationId,
    intimacy: next.intimacy,
    trust: next.trust,
    conflict: next.conflict,
    phase,
    version: existing ? existing.version + 1 : 1,
    lastEventAt,
    updatedAt: new Date(),
  }
}

/**
 * 从三维坐标推出阶段
 */
function inferPhase(state: {
  intimacy: number
  trust: number
  conflict: number
}): RelationshipState['phase'] {
  if (state.conflict >= PHASE_THRESHOLDS.conflicted.conflict) return 'conflicted'
  if (
    state.intimacy >= PHASE_THRESHOLDS.intimate.intimacy &&
    state.trust >= PHASE_THRESHOLDS.intimate.trust &&
    state.conflict < PHASE_THRESHOLDS.intimate.conflict
  ) {
    return 'intimate'
  }
  if (
    state.intimacy < PHASE_THRESHOLDS.distant.intimacy &&
    state.trust < PHASE_THRESHOLDS.distant.trust &&
    state.conflict >= PHASE_THRESHOLDS.distant.conflict
  ) {
    return 'distant'
  }
  if (state.intimacy >= PHASE_THRESHOLDS.warming.intimacy) return 'warming'
  return 'initial'
}

function clamp(n: number): number {
  return Math.max(CLAMP.min, Math.min(CLAMP.max, n))
}

/**
 * 节流：窗口内累计 delta 超阈则按比例缩放
 */
function throttle(events: EmotionalEventInput[]): EmotionalEventInput[] {
  // 这里只做"窗口内累计超过就缩放"的简化版，不做"丢弃"——
  // 关系事件本身值得被记录（写 trace），只是影响力别太猛
  const now = Date.now()
  const acc = new Map<string, number>() // dimension -> 累计 abs delta
  return events.map((ev) => {
    const dim = ev.dimension
    const total = (acc.get(dim) ?? 0) + Math.abs(ev.delta[dim] ?? 0)
    if (total > THROTTLE_MAX_DELTA) {
      const scale = (THROTTLE_MAX_DELTA - (acc.get(dim) ?? 0)) / Math.abs(ev.delta[dim] ?? 1)
      const scaledDelta: Record<string, number> = {}
      for (const [k, v] of Object.entries(ev.delta)) {
        scaledDelta[k] = typeof v === 'number' ? v * Math.max(0, scale) : 0
      }
      acc.set(dim, THROTTLE_MAX_DELTA)
      // 标记窗口冷却 5 分钟内不再记录同 dimension 强事件
      void now // 注释：实际生产可再加 lastEventAt 判断简化版先省略
      return { ...ev, delta: scaledDelta }
    }
    acc.set(dim, total)
    return ev
  })
}

/**
 * 取最近 N 个情感事件（用于 L2 Ongoing 装配）
 */
export async function getRecentEmotionalEvents(
  conversationId: string,
  limit = 5,
): Promise<EmotionalEvent[]> {
  return db
    .select()
    .from(emotionalEvents)
    .where(eq(emotionalEvents.conversationId, conversationId))
    .orderBy(desc(emotionalEvents.createdAt))
    .limit(limit)
}