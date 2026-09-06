/**
 * M4 回填脚本：给 memories 表里已有但 embedding=null 的记录生成 embedding
 *
 * 用法：
 *   cd server
 *   EMBEDDING_API_KEY=sk-... npx tsx scripts/backfill-embeddings.ts
 *
 * 设计取舍：
 *   - 批量写入（每 16 条一批），降 API 调用频率
 *   - 失败单条跳过不阻塞全表
 *   - 进度日志打到控制台
 */
import 'dotenv/config'
import { eq, isNull, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../src/db/schema.js'
import { memories } from '../src/db/schema.js'
import { embedBatch } from '../src/services/embeddings.js'

/**
 * 批量脚本专用连接：优先 DIRECT_URL（5432 直连）
 * 原因同 seed-conversations.ts —— Supabase pooler 对大批量写入不友好
 */
const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!connUrl) throw new Error('未配置 DIRECT_URL 或 DATABASE_URL')
const sqlClient = postgres(connUrl, {
  prepare: !connUrl.includes('pooler.supabase.com'),
  max: 4,
  idle_timeout: 30,
  connect_timeout: 30,
})
const db = drizzle(sqlClient, { schema })
// 按端口判断连接模式（主机名里都带 pooler，不能用来区分）
const isDirectPort = /:5432(\/|$|\?)/.test(connUrl)
console.log(
  `🔌 连接模式：${isDirectPort ? '直连(5432)' : 'pooler(6543)'} [${
    connUrl === process.env.DIRECT_URL ? 'DIRECT_URL' : 'DATABASE_URL'
  }]`,
)

const BATCH = 10

const rows = await db
  .select({ id: memories.id, content: memories.content, summary: memories.summary })
  .from(memories)
  .where(isNull(memories.embedding))
  .limit(2000)

console.log(`[backfill] 待回填: ${rows.length} 条`)

let done = 0
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  // 与 seed-conversations.ts 保持一致：content + summary 拼接作为 embedding 输入
  const texts = chunk.map((r) => [r.content, r.summary].filter(Boolean).join(' / '))
  try {
    const { vectors } = await embedBatch(texts)
    for (let j = 0; j < chunk.length; j++) {
      if (!vectors[j]) continue
      await db
        .update(memories)
        .set({ embedding: vectors[j], updatedAt: new Date() })
        .where(eq(memories.id, chunk[j].id))
        .execute()
    }
    // 只统计真实写库的条数，跳过的不算成功
    done += chunk.filter((_, j) => !!vectors[j]).length
    console.log(`[backfill] 进度: ${done}/${rows.length}`)
  } catch (err) {
    console.warn(
      `[backfill] 批次 ${i}-${i + chunk.length} 失败，跳过:`,
      err instanceof Error ? err.message : err,
    )
  }
}

const [{ n: withVec }] = await db
  .select({ n: sql<number>`count(*)::int` })
  .from(memories)
  .where(sql`embedding IS NOT NULL`)
const [{ n: total }] = await db.select({ n: sql<number>`count(*)::int` }).from(memories)

console.log(`[backfill] ✓ 完成，本次回填 ${done} 条`)
console.log(`[backfill] 库中记忆 ${total} 条，其中有向量 ${withVec} 条`)

await sqlClient.end()