/**
 * 检索 Benchmark 评估脚本 —— M6
 *
 * 用法：
 *   npx tsx scripts/run-benchmark.ts
 *
 * 流程：
 *   1. 从 queries.ts 读评测集
 *   2. 对每条 query 调 /api/retrieval/search（topK=8）
 *   3. 计算 Recall@K / Precision@K / NDCG@K / MRR
 *   4. 按类别聚合指标（keyword / semantic / emotion / cross / negative）
 *   5. 把每条 query 的命中详情 + 总分写到 results.json
 *
 * 输出：
 *   - benchmark/results.json（结构化）
 *   - benchmark/last-run.log（人类可读）
 *
 * 指标说明：
 *   Recall@K    期望命中集合 / 实际期望集合
 *   Precision@K 实际命中且在期望里 / K
 *   NDCG@K      排序质量（理想 DCG vs 实际 DCG）
 *   MRR         第一个命中在期望里的倒数排名
 */

import { writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { QUERIES, CONVERSATION_ID } from './queries.js'

const BASE_URL = process.env.BENCHMARK_BASE_URL ?? 'http://localhost:8787'
const TOP_K = Number(process.env.BENCHMARK_TOP_K ?? 8)

interface RetrievedMemory {
  id: string
  content: string
  kind: string
  score: number
}

interface RetrievalTrace {
  durationMs: number
  embeddingAvailable: boolean
  vectorHits: number
  textHits: number
  finalHits: number
}

interface QueryResult {
  id: string
  query: string
  category: string
  expectedIds: string[]
  retrievedIds: string[]
  hitMask: boolean[]
  trace: RetrievalTrace
  durationMs: number
  metrics: {
    recallAt5: number
    recallAt8: number
    precisionAt5: number
    precisionAt8: number
    ndcgAt8: number
    mrr: number
  }
  note: string
}

async function runOneQuery(q: typeof QUERIES[number]): Promise<QueryResult> {
  const url = `${BASE_URL}/api/retrieval/search?conversationId=${CONVERSATION_ID}&q=${encodeURIComponent(q.query)}&topK=${TOP_K}`
  const t0 = Date.now()
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for query "${q.query}"`)
  const body = (await resp.json()) as { items: RetrievedMemory[]; trace: RetrievalTrace }
  const durationMs = Date.now() - t0

  const retrievedIds = body.items.map((it) => it.id)
  const expectedSet = new Set(q.expectedIds)
  const hitMask = retrievedIds.map((id) => expectedSet.has(id))

  // Recall@K: 实际期望命中数 / 总期望数
  const totalExpected = q.expectedIds.length
  const hitsInTop5 = hitMask.slice(0, 5).filter(Boolean).length
  const hitsInTop8 = hitMask.filter(Boolean).length
  const recallAt5 = totalExpected === 0 ? (hitsInTop5 === 0 ? 1 : 0) : hitsInTop5 / totalExpected
  const recallAt8 = totalExpected === 0 ? (hitsInTop8 === 0 ? 1 : 0) : hitsInTop8 / totalExpected

  // Precision@K
  const precisionAt5 = hitsInTop5 / 5
  const precisionAt8 = hitsInTop8 / TOP_K

  // NDCG@K：用相关性（期望排序 = 真实相关性）计算
  // relevance(i) = max(0, totalExpected - rank_in_expected)
  const relevanceOf = (id: string): number => {
    const idx = q.expectedIds.indexOf(id)
    return idx < 0 ? 0 : totalExpected - idx
  }
  const dcg = hitMask.reduce((sum, hit, i) => {
    if (!hit) return sum
    const id = retrievedIds[i]
    const rel = relevanceOf(id)
    return sum + rel / Math.log2(i + 2)
  }, 0)
  const idealDcg = q.expectedIds.reduce((sum, _id, i) => {
    const rel = totalExpected - i
    return sum + rel / Math.log2(i + 2)
  }, 0)
  const ndcgAt8 = idealDcg > 0 ? dcg / idealDcg : (hitsInTop8 === 0 ? 1 : 0)

  // MRR：第一个真实命中在期望列表里的位置倒数
  let mrr = 0
  for (let i = 0; i < retrievedIds.length; i++) {
    if (expectedSet.has(retrievedIds[i])) {
      mrr = 1 / (i + 1)
      break
    }
  }
  // 期望为空且召回为空：mrr=1（不算错）
  if (totalExpected === 0 && hitsInTop8 === 0) mrr = 1

  return {
    id: q.id,
    query: q.query,
    category: q.category,
    expectedIds: q.expectedIds,
    retrievedIds,
    hitMask,
    trace: body.trace,
    durationMs,
    metrics: { recallAt5, recallAt8, precisionAt5, precisionAt8, ndcgAt8, mrr },
    note: q.note,
  }
}

function aggregate(results: QueryResult[]) {
  const byCat: Record<string, QueryResult[]> = {}
  for (const r of results) {
    byCat[r.category] ??= []
    byCat[r.category].push(r)
  }
  const overall = {
    n: results.length,
    recallAt5: avg(results.map((r) => r.metrics.recallAt5)),
    recallAt8: avg(results.map((r) => r.metrics.recallAt8)),
    precisionAt5: avg(results.map((r) => r.metrics.precisionAt5)),
    precisionAt8: avg(results.map((r) => r.metrics.precisionAt8)),
    ndcgAt8: avg(results.map((r) => r.metrics.ndcgAt8)),
    mrr: avg(results.map((r) => r.metrics.mrr)),
    avgDurationMs: avg(results.map((r) => r.durationMs)),
  }
  const byCategory: Record<string, ReturnType<typeof aggOne>> = {}
  for (const [cat, list] of Object.entries(byCat)) {
    byCategory[cat] = aggOne(list)
  }
  return { overall, byCategory }
}

function aggOne(list: QueryResult[]) {
  return {
    n: list.length,
    recallAt5: avg(list.map((r) => r.metrics.recallAt5)),
    recallAt8: avg(list.map((r) => r.metrics.recallAt8)),
    precisionAt5: avg(list.map((r) => r.metrics.precisionAt5)),
    precisionAt8: avg(list.map((r) => r.metrics.precisionAt8)),
    ndcgAt8: avg(list.map((r) => r.metrics.ndcgAt8)),
    mrr: avg(list.map((r) => r.metrics.mrr)),
  }
}

function avg(xs: number[]) { return xs.reduce((s, x) => s + x, 0) / xs.length }

async function main() {
  const t0 = Date.now()
  const results: QueryResult[] = []
  for (const q of QUERIES) {
    try {
      const r = await runOneQuery(q)
      results.push(r)
      const ok = r.metrics.recallAt8 >= 0.6 ? '✓' : '✗'
      console.log(`${ok} [${r.category.padEnd(8)}] R@8=${r.metrics.recallAt8.toFixed(2)} P@8=${r.metrics.precisionAt8.toFixed(2)} NDCG=${r.metrics.ndcgAt8.toFixed(2)} "${r.query}"`)
    } catch (e) {
      console.error(`! [${q.category}] "${q.query}" → ${(e as Error).message}`)
    }
  }
  const totalMs = Date.now() - t0
  const agg = aggregate(results)

  const out = {
    meta: {
      conversationId: CONVERSATION_ID,
      baseUrl: BASE_URL,
      topK: TOP_K,
      totalQueries: results.length,
      totalDurationMs: totalMs,
      timestamp: new Date().toISOString(),
    },
    aggregate: agg,
    perQuery: results,
  }

  const outPath = join(process.cwd(), 'benchmark', 'results.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8')

  const logPath = join(process.cwd(), 'benchmark', 'last-run.log')
  const lines: string[] = []
  lines.push(`# Benchmark run @ ${out.meta.timestamp}`)
  lines.push(`base=${BASE_URL} topK=${TOP_K} queries=${results.length} duration=${totalMs}ms`)
  lines.push('')
  lines.push(`## Overall (n=${agg.overall.n})`)
  lines.push(`  Recall@5    = ${pct(agg.overall.recallAt5)}`)
  lines.push(`  Recall@8    = ${pct(agg.overall.recallAt8)}`)
  lines.push(`  Precision@5 = ${pct(agg.overall.precisionAt5)}`)
  lines.push(`  Precision@8 = ${pct(agg.overall.precisionAt8)}`)
  lines.push(`  NDCG@8      = ${pct(agg.overall.ndcgAt8)}`)
  lines.push(`  MRR         = ${pct(agg.overall.mrr)}`)
  lines.push(`  Avg latency = ${agg.overall.avgDurationMs.toFixed(0)}ms`)
  lines.push('')
  lines.push(`## By category`)
  for (const [cat, m] of Object.entries(agg.byCategory)) {
    lines.push(`  [${cat.padEnd(8)}] n=${m.n} R@8=${pct(m.recallAt8)} P@8=${pct(m.precisionAt8)} NDCG@8=${pct(m.ndcgAt8)} MRR=${pct(m.mrr)}`)
  }
  lines.push('')
  lines.push(`## Per-query detail`)
  for (const r of results) {
    lines.push(`  ${r.id.padEnd(28)} [${r.category}] "${r.query}"`)
    lines.push(`    expected=${r.expectedIds.length} hit@5=${r.hitMask.slice(0, 5).filter(Boolean).length} hit@8=${r.hitMask.filter(Boolean).length} R@8=${pct(r.metrics.recallAt8)} P@8=${pct(r.metrics.precisionAt8)} NDCG=${pct(r.metrics.ndcgAt8)} MRR=${pct(r.metrics.mrr)}`)
    lines.push(`    note: ${r.note}`)
  }
  appendFileSync(logPath, lines.join('\n') + '\n', 'utf-8')

  console.log(`\nWrote ${outPath} (${results.length} queries, ${totalMs}ms)`)
  console.log(`Overall: R@8=${pct(agg.overall.recallAt8)} P@8=${pct(agg.overall.precisionAt8)} NDCG@8=${pct(agg.overall.ndcgAt8)} MRR=${pct(agg.overall.mrr)}`)
}

function pct(x: number) { return (x * 100).toFixed(1) + '%' }

main().catch((e) => { console.error(e); process.exit(1) })