/** 修正：M11 会话记忆是因对照实验隔离（非闸门拦截），真实 origin 未知 → 置空 */
import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client.js'

await db.execute(sql`UPDATE memories SET origin = NULL WHERE conversation_id = 'e182b05e-01f7-4e1f-a617-f6c4466c05e5'`)
const rows = (await db.execute(
  sql`SELECT origin, status, count(*)::int AS n FROM memories GROUP BY origin, status ORDER BY origin NULLS LAST, status`,
)) as unknown as Array<{ origin: string | null; status: string; n: number }>
for (const r of rows) console.log(`origin=${r.origin ?? 'null'} status=${r.status} n=${r.n}`)
process.exit(0)
