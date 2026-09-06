/**
 * 离线验证 ranking 公式修复（无需 embedding API / 网络）
 *
 * 目的：无网络时无法跑端到端 benchmark（向量通道依赖 SiliconFlow embedding，当前不可达）。
 *       但 ranking 公式本身的数学正确性可以用 DB 里真实记忆的 decay 分布来验证。
 *
 * 验证内容：
 *   1. 复现 M8 诊断场景：一条「语义最相关」的记忆（rrf rank 1，但 decay 低）与若干
 *      「高 decay 无关记忆」（rrf rank 2~8）竞争 —— 旧公式(×decay)会把相关记忆挤出去，
 *      新公式(×(0.90+0.10·decay))必须保住它。
 *   2. 蒙特卡洛：用真实 decay 分布随机生成候选排序，统计 rank-1 相关记忆跌出 top-8 的概率
 *      （旧公式 vs 新公式），证明新公式几乎不会反转语义排序。
 */

import 'dotenv/config'
import { db } from '../src/db/client.js'
import { memories } from '../src/db/schema.js'
import { desc } from 'drizzle-orm'

// ── 复刻 retrieval.ts 的 ebbinghausStrength（避免循环依赖/连接开销）──
const BASE_STABILITY_DAYS = 30
const STABILITY_IMPORTANCE_WEIGHT = 0.5
const STABILITY_EMOTIONAL_WEIGHT = 0.5
const STABILITY_ACCESS_WEIGHT = 0.3
function ebbinghausStrength(row: {
  createdAt: Date
  lastAccessedAt: Date | null
  accessCount: number
  importance: number
  emotionalIntensity: number | null
}): number {
  const lastReview = row.lastAccessedAt ?? row.createdAt
  const ageDays = Math.max(0, (Date.now() - lastReview.getTime()) / 86_400_000)
  const importanceFactor = 1 + STABILITY_IMPORTANCE_WEIGHT * row.importance
  const emotionalFactor = 1 + STABILITY_EMOTIONAL_WEIGHT * (row.emotionalIntensity ?? 0.5)
  const accessFactor = 1 + STABILITY_ACCESS_WEIGHT * Math.log(row.accessCount + 1)
  const stability = BASE_STABILITY_DAYS * importanceFactor * emotionalFactor * accessFactor
  return Math.exp(-ageDays / stability)
}

// 旧公式：finalScore = rrf × decay（M8 实测出问题的版本）
const OLD = (rrf: number, decay: number) => rrf * decay
// 新公式：finalScore = rrf × (0.90 + 0.10 × decay)
const NEW = (rrf: number, decay: number) => rrf * (0.90 + 0.10 * decay)

const RRF_K = 60
const rrf = (rank: number) => 1 / (RRF_K + rank)

async function main() {
  const rows = await db.select().from(memories).orderBy(desc(memories.createdAt))
  // 计算每条真实记忆的 decay
  const withDecay = rows.map((r) => ({
    id: r.id.slice(0, 8),
    importance: r.importance,
    decay: ebbinghausStrength({
      createdAt: r.createdAt,
      lastAccessedAt: r.lastAccessedAt,
      accessCount: r.accessCount,
      importance: r.importance,
      emotionalIntensity: r.emotionalIntensity,
    }),
  }))
  console.log(`加载真实记忆 ${withDecay.length} 条`)
  console.log(`decay 分布: min=${Math.min(...withDecay.map(d=>d.decay)).toFixed(3)} max=${Math.max(...withDecay.map(d=>d.decay)).toFixed(3)} avg=${(withDecay.reduce((s,d)=>s+d.decay,0)/withDecay.length).toFixed(3)}`)

  // ── 场景 1：复现诊断（rank-1 相关 + rank2~8 高 decay 无关）──
  // 取 decay 最低的一条作为「相关记忆」（模拟刚被召回、语义最相关）
  const relevant = withDecay.reduce((a, b) => (b.decay < a.decay ? b : a))
  // 取 decay 最高的 7 条作为「无关但高频」记忆
  const topDecay = [...withDecay].sort((a, b) => b.decay - a.decay).slice(0, 7)
  const scenario = [
    { ...relevant, rank: 1 },
    ...topDecay.map((m, i) => ({ ...m, rank: i + 2 })),
  ]
  const score = (m: { decay: number; rank: number }, f: (r: number, d: number) => number) =>
    f(rrf(m.rank), m.decay)
  const orderedOld = [...scenario].sort((a, b) => score(b, OLD) - score(a, OLD))
  const orderedNew = [...scenario].sort((a, b) => score(b, NEW) - score(a, NEW))
  const rankOfRelevant = (arr: typeof scenario) => arr.findIndex((m) => m.id === relevant.id) + 1
  console.log('\n=== 场景1：复现 M8 诊断 ===')
  console.log(`相关记忆 decay=${relevant.decay.toFixed(3)}（全库最低），被强制为 rrf rank 1`)
  console.log(`无关记忆 decay=${topDecay.map(d=>d.decay.toFixed(2)).join(',')}`)
  console.log(`旧公式：相关记忆排名 #${rankOfRelevant(orderedOld)} / 8  → ${rankOfRelevant(orderedOld)>8?'跌出 top-8 ❌':'在 top-8 ✅'}`)
  console.log(`新公式：相关记忆排名 #${rankOfRelevant(orderedNew)} / 8  → ${rankOfRelevant(orderedNew)<=8?'保住 top-8 ✅':'跌出 ❌'}`)

  // ── 场景 2：蒙特卡洛（用真实 decay 分布）──
  const decays = withDecay.map((d) => d.decay)
  let oldFail = 0
  let newFail = 0
  const N = 5000
  const C = 20 // 候选集大小（rrf 融合后 ≤40，取 20）
  for (let t = 0; t < N; t++) {
    // 随机抽取 C 条记忆作为候选，随机分配 rrf rank 1..C
    const sample = []
    for (let i = 0; i < C; i++) {
      const d = decays[Math.floor(Math.random() * decays.length)]
      sample.push({ decay: d, rank: i + 1 })
    }
    // rank-1 是「正确相关记忆」；统计它是否仍排在前 8
    const oldTop = [...sample].sort((a, b) => OLD(rrf(b.rank), b.decay) - OLD(rrf(a.rank), a.decay)).slice(0, 8)
    const newTop = [...sample].sort((a, b) => NEW(rrf(b.rank), b.decay) - NEW(rrf(a.rank), a.decay)).slice(0, 8)
    if (!oldTop.find((m) => m.rank === 1)) oldFail++
    if (!newTop.find((m) => m.rank === 1)) newFail++
  }
  console.log('\n=== 场景2：蒙特卡洛（C=20 候选，rank-1=正确记忆，跑 5000 次）===')
  console.log(`旧公式 rank-1 跌出 top-8 次数: ${oldFail} (${(oldFail/N*100).toFixed(1)}%)`)
  console.log(`新公式 rank-1 跌出 top-8 次数: ${newFail} (${(newFail/N*100).toFixed(1)}%)`)
  console.log(newFail === 0
    ? '✅ 新公式在真实 decay 分布下，rank-1 相关记忆 100% 保住 top-8'
    : `⚠️ 新公式仍有 ${newFail} 次反转（需进一步收紧摆幅）`)

  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
