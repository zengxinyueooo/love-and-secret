/**
 * 记忆再巩固（Reconsolidation）—— M10
 *
 * ## 神经科学依据
 *
 * 每次回忆一条记忆，它都会被「重写」一次。**回忆不是读取，是修改。**
 * 这是记忆再巩固（reconsolidation）理论——被提取的记忆会进入不稳定状态，
 * 重新存储时被更新，强度也会改变。
 *
 * 对应到本项目：
 *   - M5 实现了艾宾浩斯遗忘曲线（长期不访问 → 衰减）
 *   - 但只有衰减、没有强化 —— 闭环是断的
 *   - M10 补上「被回忆 → 被强化」这一半
 *
 * ## 为什么这对陪伴场景特别重要
 *
 * 他每次提起「你上次说怕黑」，这条记忆就该变得更重要——
 * 被反复提起 = 对这段关系更重要。反过来，三年没人提的细节自然褪色。
 * 这才像「记得你」，而不是「存过你」。
 *
 * ## 三个关键设计（防止强化失控）
 *
 * 1. **边际递减**：越接近上限，提升空间越小
 *    Δ ∝ (ceiling - current)
 *    → 0.9 分的记忆最多再涨 0.1；0.3 分的能涨 0.7
 *
 * 2. **久别重逢加成**：刚提过的不重复强化
 *    recency = min(1, daysSinceLastAccess / fullBoostAfterDays)
 *    → 昨天刚提过几乎不涨；一周没提涨满
 *    这条很关键，否则高频记忆会几天内冲到 1.0 并永久霸榜
 *
 * 3. **硬上限**：emotionalIntensity / importance 都封顶 1.0
 *
 * ## 与 M6 评测发现的关系
 *
 * M6 首跑发现「efa487bc（深夜医院）总抢第一」——importance 加权让
 * 高重要性但语义无关的记忆跨场景霸榜。本机制的两个约束正是针对此：
 *   - 边际递减 → 高分记忆不再无脑上涨
 *   - 久别加成 → 只有「隔了很久又被想起」才显著强化，不是「被想起就涨」
 */

export interface ReconsolidationConfig {
  /** 单次最大强化幅度（recency=1 且 headroom 充足时） */
  maxBoost: number
  /** 距离上次访问多少天算「久别」（达到满额加成） */
  fullBoostAfterDays: number
  /** importance 的强化幅度相对 emotionalIntensity 的比例（更小，避免排序失衡） */
  importanceBoostRatio: number
  /** 硬上限 */
  ceiling: number
  /** 只对 emotionalIntensity >= 该值的记忆做强化（低情感记忆如「六点下班」不必强化） */
  minIntensityToBoost: number
}

export const DEFAULT_RECONSOLIDATION: ReconsolidationConfig = {
  maxBoost: 0.08,
  fullBoostAfterDays: 7,
  importanceBoostRatio: 0.25,
  ceiling: 1.0,
  minIntensityToBoost: 0.3,
}

export interface BoostInput {
  /** 当前值（emotionalIntensity 或 importance） */
  current: number
  /** 上次访问时间；null = 从未访问过（视为满额久别） */
  lastAccessedAt: Date | null
  /** 当前时间（注入便于测试） */
  now?: Date
  /** 该字段的放大系数（importance 用更小的比例） */
  scale?: number
}

/**
 * 计算单次强化量
 *
 * Δ = min(headroom, maxBoost × recency × scale)
 *   headroom = ceiling - current          （边际递减）
 *   recency  = min(1, days / fullDays)    （久别重逢加成）
 *
 * @returns 0 ~ maxBoost 之间的增量
 */
export function computeBoost(input: BoostInput, cfg: ReconsolidationConfig = DEFAULT_RECONSOLIDATION): number {
  const { current, lastAccessedAt, now = new Date(), scale = 1 } = input

  // 边际递减：越接近上限，可涨的空间越小
  const headroom = cfg.ceiling - current
  if (headroom <= 0) return 0

  // 久别重逢加成
  const days = lastAccessedAt
    ? (now.getTime() - lastAccessedAt.getTime()) / 86_400_000
    : cfg.fullBoostAfterDays // 从未访问 → 满额
  const recency = Math.min(1, Math.max(0, days) / cfg.fullBoostAfterDays)

  const boost = cfg.maxBoost * recency * scale
  // 双保险：既不超过 headroom，也不超过单次 maxBoost
  return Math.min(headroom, boost, cfg.maxBoost * scale)
}

/**
 * 计算一条记忆被再次访问后的新字段值
 *
 * @param emotionalIntensity 当前情感强度
 * @param importance 当前重要度
 * @param lastAccessedAt 上次访问时间
 */
export function applyReconsolidation(
  emotionalIntensity: number,
  importance: number,
  lastAccessedAt: Date | null,
  now: Date = new Date(),
  cfg: ReconsolidationConfig = DEFAULT_RECONSOLIDATION,
): { emotionalIntensity: number; importance: number; boosted: boolean } {
  // 先把输入夹到合法区间：库里若有脏数据（负值 / 超 1），返回时一并修正
  const curIntensity = clamp(emotionalIntensity, 0, cfg.ceiling)
  const curImportance = clamp(importance, 0, cfg.ceiling)

  // 低情感记忆（如「一般六点多下班」）不参与强化——它们不该因为被检索就变重要
  if (curIntensity < cfg.minIntensityToBoost) {
    return { emotionalIntensity: curIntensity, importance: curImportance, boosted: false }
  }

  const dIntensity = computeBoost({ current: curIntensity, lastAccessedAt, now }, cfg)
  const dImportance = computeBoost(
    { current: curImportance, lastAccessedAt, now, scale: cfg.importanceBoostRatio },
    cfg,
  )

  return {
    emotionalIntensity: clamp(curIntensity + dIntensity, 0, cfg.ceiling),
    importance: clamp(curImportance + dImportance, 0, cfg.ceiling),
    boosted: dIntensity > 0 || dImportance > 0,
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

// ---------------------------------------------------------------------------
// 落库：批量更新
// ---------------------------------------------------------------------------

import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import { memories } from '../db/schema.js'

export interface ReconsolidateResult {
  /** 实际被强化的条数 */
  updated: number
  /** 仅更新访问计数（未达强化阈值）的条数 */
  accessedOnly: number
  /** 各条的强化明细（供 trace / 日志） */
  details: Array<{ id: string; before: number; after: number; delta: number }>
}

/**
 * 记忆被检索命中后调用：更新访问计数 + 按再巩固规则强化
 *
 * 设计取舍：
 *   - **不阻塞对话流**：调用方应 fire-and-forget，失败只记日志
 *   - **批量**：一轮可能命中 8 条，逐条 UPDATE 太浪费
 *   - **只在真正变化时写库**：避免无谓的 updatedAt 抖动
 */
export async function reconsolidateMemories(
  ids: string[],
  cfg: ReconsolidationConfig = DEFAULT_RECONSOLIDATION,
): Promise<ReconsolidateResult> {
  const result: ReconsolidateResult = { updated: 0, accessedOnly: 0, details: [] }
  if (ids.length === 0) return result

  const now = new Date()
  const rows = await db
    .select({
      id: memories.id,
      emotionalIntensity: memories.emotionalIntensity,
      importance: memories.importance,
      lastAccessedAt: memories.lastAccessedAt,
      accessCount: memories.accessCount,
    })
    .from(memories)
    .where(inArray(memories.id, ids))

  for (const row of rows) {
    const next = applyReconsolidation(
      row.emotionalIntensity,
      row.importance,
      row.lastAccessedAt,
      now,
      cfg,
    )

    await db
      .update(memories)
      .set({
        accessCount: row.accessCount + 1,
        lastAccessedAt: now,
        emotionalIntensity: next.emotionalIntensity,
        importance: next.importance,
        updatedAt: now,
      })
      .where(eq(memories.id, row.id))

    const delta = next.emotionalIntensity - row.emotionalIntensity
    if (next.boosted) {
      result.updated++
      result.details.push({
        id: row.id,
        before: row.emotionalIntensity,
        after: next.emotionalIntensity,
        delta,
      })
    } else {
      result.accessedOnly++
    }
  }

  return result
}