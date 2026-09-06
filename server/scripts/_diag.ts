/**
 * 诊断：区分「召回问题」还是「排序问题」
 *
 * 对指定 query 做纯向量检索（绕过 applyFinalRanking），
 * 看期望记忆在原始向量距离里排第几。
 *
 *   期望记忆在向量 Top-5  → 是排序阶段（decay 权重）把它挤掉了
 *   期望记忆排 30 名开外  → 是 embedding 本身的语义匹配问题
 */
import 'dotenv/config'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../src/db/schema.js'
import { embedBatch, getEmbeddingConfig } from '../src/services/embeddings.js'

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!
const client = postgres(connUrl, { prepare: false, max: 4, connect_timeout: 30 })
const db = drizzle(client, { schema })

const CASES = [
  {
    q: '送她什么花比较好',
    expect: ['她喜欢茉莉花', '花粉过敏，严重会喘', '鲜花不能进卧室'],
  },
  {
    q: '他都是怎么表达在乎我的',
    expect: ['躺在那儿的是你，手凉的是我', '不会都答应，但我会听完', '你说的每句想去的地方我都当真'],
  },
  {
    q: '她怕黑吗',
    expect: ['怕黑', '停电夜黎深陪怕黑的她'],
  },
]

async function main() {
  const cfg = getEmbeddingConfig()
  if (!cfg) throw new Error('缺少 EMBEDDING_API_KEY')

  for (const c of CASES) {
    console.log(`\n${'='.repeat(70)}`)
    console.log(`query: "${c.q}"`)
    const { vectors } = await embedBatch([c.q], cfg)
    const vec = vectors[0]!
    const literal = `[${vec.join(',')}]`

    // 纯向量距离排名（不加 final ranking）
    const rows = (await db.execute(sql`
      SELECT id, summary, content, importance, emotional_intensity,
             embedding <=> ${literal}::vector AS distance
      FROM memories
      WHERE status = 'active' AND embedding IS NOT NULL
      ORDER BY embedding <=> ${literal}::vector
      LIMIT 40
    `)) as Array<{
      id: string
      summary: string | null
      content: string
      importance: number
      emotional_intensity: number
      distance: number
    }>

    console.log(`  向量 Top-10（距离越小越相关）：`)
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const r = rows[i]
      const isExpected = c.expect.some((e) => (r.summary ?? r.content).includes(e))
      const mark = isExpected ? '★期望' : '     '
      console.log(
        `   ${String(i + 1).padStart(2)}. ${mark} d=${r.distance.toFixed(4)} imp=${r.importance.toFixed(2)} ${(r.summary ?? r.content).slice(0, 38)}`,
      )
    }

    // 每条期望记忆的实际向量排名
    console.log(`  期望记忆的向量排名：`)
    for (const e of c.expect) {
      const idx = rows.findIndex((r) => (r.summary ?? r.content).includes(e))
      if (idx >= 0) {
        console.log(`     • ${e.slice(0, 30).padEnd(32)} → 第 ${idx + 1} 名 (d=${rows[idx].distance.toFixed(4)})`)
      } else {
        console.log(`     • ${e.slice(0, 30).padEnd(32)} → 40 名开外 ❌`)
      }
    }
  }

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})