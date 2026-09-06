/** 验证 origin 列已持久化并随 schema 读取正常 */
import 'dotenv/config'
import { eq, sql } from 'drizzle-orm'
import { db } from '../src/db/client.js'
import { memories } from '../src/db/schema.js'

const rows = await db
  .select({ origin: memories.origin, status: memories.status, n: sql<number>`count(*)::int` })
  .from(memories)
  .groupBy(memories.origin, memories.status)
console.log('origin/status 分布:', rows)

const sample = await db.select().from(memories).where(eq(memories.origin, 'assistant')).limit(3)
for (const m of sample) console.log(`[assistant|${m.status}] ${m.content.slice(0, 50)}`)
process.exit(0)
