/**
 * 混合检索服务 —— M4
 *
 * 三路召回 + RRF 融合：
 *   通道 A：向量召回（pgvector cosine）
 *   通道 B：全文召回（tsvector @@ websearch_to_tsquery）
 *   通道 C：时间衰减 + importance 排序（无新通道，是融合权重）
 *
 * 为什么是混合而非单一：
 *   - 纯向量：长尾措辞命中差（「纪念日」「三周年」专有名词召回困难）
 *   - 纯全文：同义改写召回差（"开夜灯" vs "怕黑睡不好" 语义相关但字面不同）
 *   - 混合：让两者互补，RRF 在不做归一化打分的前提下融合多个排序
 *
 * 衰减设计：
 *   越新的记忆越重要；importance 高的衰减更慢
 *   weight = importance × exp(-age_days / half_life)
 *   half_life 默认 30 天（半衰期），3 个月后记忆权重自然降到 25%
 *
 * RRF 公式（来自 Cormack et al. 2009）：
 *   rrf(d) = Σ 1 / (k + rank_i(d))   k 默认 60
 */

import { sql, and, eq, desc, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import { memories, EMBEDDING_DIM } from '../db/schema.js'
import { embed, getEmbeddingConfig } from './embeddings.js'

/** RRF 融合常数 k —— 值越大低排名差异越平滑 */
const RRF_K = 60

/** 半衰期（天）：默认 30 天后记忆权重衰减到 50% */
const HALF_LIFE_DAYS = 30

/** 检索 topK（每个通道单独取 topK，再 RRF） */
const CHANNEL_TOP_K = 20

/** 最终返回数 */
const FINAL_TOP_K = 8

export interface RetrievedMemory {
  id: string
  conversationId: string | null
  kind: 'fact' | 'episode' | 'emotion' | 'event'
  content: string
  summary: string | null
  importance: number
  confidence: number
  createdAt: string
  /** 该记忆被哪条通道召回（vector | text | both） */
  source: 'vector' | 'text' | 'both'
  /** RRF 融合后的最终相关度分数（0-1，越大越相关） */
  score: number
}

export interface RetrievalTrace {
  query: string
  vectorHits: number
  textHits: number
  rrfTopK: number
  durationMs: number
  embeddingAvailable: boolean
}

/**
 * 主入口：给定查询 + 会话，做混合检索
 * @param query 用户当前的输入（或要检索的关键词）
 * @param conversationId 限定到该会话内的记忆
 * @param topK 最终返回条数
 */
export async function searchMemories(
  query: string,
  conversationId: string,
  topK: number = FINAL_TOP_K,
): Promise<{ items: RetrievedMemory[]; trace: RetrievalTrace }> {
  const started = Date.now()
  const trace: RetrievalTrace = {
    query,
    vectorHits: 0,
    textHits: 0,
    rrfTopK: 0,
    durationMs: 0,
    embeddingAvailable: !!getEmbeddingConfig(),
  }

  const trimmedQuery = query.trim().slice(0, 500) // 防超长输入爆 SQL

  // 通道 A：向量检索
  const queryEmbedding = await embed(trimmedQuery).catch(() => null)
  const vectorRows = queryEmbedding
    ? await vectorSearch(queryEmbedding, conversationId)
    : []
  trace.vectorHits = vectorRows.length

  // 通道 B：全文检索（即使 embedding 失败也能跑）
  const textRows = await textSearch(trimmedQuery, conversationId)
  trace.textHits = textRows.length

  // RRF 融合
  const fused = rrfFuse(vectorRows, textRows)
  trace.rrfTopK = fused.length

  // 按 RRF score × 时间衰减 × importance 重排
  const ranked = await applyFinalRanking(fused)
  const items = ranked.slice(0, topK).map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    kind: row.kind,
    content: row.content,
    summary: row.summary,
    importance: row.importance,
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
    source: row.source,
    score: row.score,
  }))

  trace.durationMs = Date.now() - started
  return { items, trace }
}

/**
 * 通道 A：向量召回 —— pgvector cosine
 * 余弦相似度越大越相关，取 topK 按相似度排序
 */
async function vectorSearch(
  queryVec: number[],
  conversationId: string,
): Promise<Array<{ id: string; rank: number }>> {
  const vecLiteral = `[${queryVec.join(',')}]`
  const rows = await db.execute<{ id: string; distance: number }>(sql`
      SELECT id, embedding <=> ${vecLiteral}::vector(${EMBEDDING_DIM}) AS distance
      FROM memories
      WHERE conversation_id = ${conversationId}
        AND status = 'active'
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vecLiteral}::vector(${EMBEDDING_DIM})
      LIMIT ${CHANNEL_TOP_K}
    `)
  return rows.map((r, idx) => ({ id: (r as { id: string }).id, rank: idx + 1 }))
}

/**
 * 通道 B：全文召回 —— tsvector + websearch_to_tsquery
 * websearch_to_tsquery 接受自然语言，自动转成 tsquery（处理引号、AND/OR 等）
 * 用 ts_rank_cd 打分（同条记忆命中多次的位置分散度）
 */
async function textSearch(
  query: string,
  conversationId: string,
): Promise<Array<{ id: string; rank: number }>> {
  if (!query) return []
  const rows = await db.execute<{ id: string; rank: number }>(sql`
      SELECT id, ts_rank_cd(content_tsv, websearch_to_tsquery('simple', ${query})) AS rank
      FROM memories
      WHERE conversation_id = ${conversationId}
        AND status = 'active'
        AND content_tsv @@ websearch_to_tsquery('simple', ${query})
      ORDER BY rank DESC
      LIMIT ${CHANNEL_TOP_K}
    `)
  return rows.map((r, idx) => ({ id: (r as { id: string }).id, rank: idx + 1 }))
}

/** RRF 融合：把两路召回按排名融合成单一排序 */
function rrfFuse(
  vectorRows: Array<{ id: string; rank: number }>,
  textRows: Array<{ id: string; rank: number }>,
): Array<{ id: string; rrfScore: number; source: 'vector' | 'text' | 'both' }> {
  const map = new Map<string, { rrf: number; source: 'vector' | 'text' | 'both' }>()
  for (const r of vectorRows) {
    map.set(r.id, { rrf: 1 / (RRF_K + r.rank), source: 'vector' })
  }
  for (const r of textRows) {
    const existing = map.get(r.id)
    const score = 1 / (RRF_K + r.rank)
    if (existing) {
      existing.rrf += score
      existing.source = 'both'
    } else {
      map.set(r.id, { rrf: score, source: 'text' })
    }
  }
  return Array.from(map.entries()).map(([id, v]) => ({
    id,
    rrfScore: v.rrf,
    source: v.source,
  }))
}

/**
 * 最终排序：RRF 分数 × 时间衰减 × importance
 * 用 importance 给"重要记忆"加权，让普通寒暄记忆自然下沉
 *
 * 关键优化：只查 RRF 融合后的候选集（≤40 条），不再扫全表
 */
async function applyFinalRanking(
  candidates: Array<{ id: string; rrfScore: number; source: 'vector' | 'text' | 'both' }>,
): Promise<Array<RetrievedMemory & { createdAt: Date }>> {
  if (candidates.length === 0) return []
  const ids = candidates.map((c) => c.id)
  const rrfById = new Map(candidates.map((c) => [c.id, c]))
  const ageDecay = (createdAt: Date) => {
    const ageDays = (Date.now() - createdAt.getTime()) / 86_400_000
    return Math.exp(-ageDays / HALF_LIFE_DAYS)
  }
  const rows = await db.select().from(memories).where(inArray(memories.id, ids))
  return rows
    .map((row) => {
      const c = rrfById.get(row.id)
      if (!c) return null
      const decay = ageDecay(row.createdAt)
      const finalScore = c.rrfScore * decay * (0.5 + 0.5 * row.importance)
      return {
        id: row.id,
        conversationId: row.conversationId,
        kind: row.kind,
        content: row.content,
        summary: row.summary,
        importance: row.importance,
        confidence: row.confidence,
        createdAt: row.createdAt,
        source: c.source,
        score: finalScore,
      }
    })
    .filter((x): x is RetrievedMemory & { createdAt: Date } => x !== null)
    .sort((a, b) => b.score - a.score)
}