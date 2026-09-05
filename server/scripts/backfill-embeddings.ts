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
import { isNull } from 'drizzle-orm'
import { db } from '../src/db/client.js'
import { memories } from '../src/db/schema.js'
import { embedBatch } from '../src/services/embeddings.js'

const BATCH = 16

const rows = await db
  .select({ id: memories.id, content: memories.content })
  .from(memories)
  .where(isNull(memories.embedding))
  .limit(2000)

console.log(`[backfill] 待回填: ${rows.length} 条`)

let done = 0
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  const texts = chunk.map((r) => r.content)
  try {
    const vectors = await embedBatch(texts)
    for (let j = 0; j < chunk.length; j++) {
      if (!vectors[j]) continue
      await db
        .update(memories)
        .set({ embedding: vectors[j], updatedAt: new Date() })
        .where((m) => m.id.eq(chunk[j].id) as never)
        // drizzle update set with where: 用 SQL 子句绕过条件构造的复杂性
        .execute()
    }
    done += chunk.length
    console.log(`[backfill] 进度: ${done}/${rows.length}`)
  } catch (err) {
    console.warn(`[backfill] 批次 ${i}-${i + chunk.length} 失败，跳过:`, err instanceof Error ? err.message : err)
  }
}

console.log(`[backfill] ✓ 完成，共回填 ${done} 条`)