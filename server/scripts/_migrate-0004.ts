/** 应用 0004 迁移：memories.origin 落库 + 存量 unverified 回填。运行：npx tsx scripts/_migrate-0004.ts */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client.js'

const migration = readFileSync('drizzle/0004_m12_origin.sql', 'utf8')
await db.execute(sql.raw(migration))
console.log('0004_m12_origin.sql 已应用')

const rows = (await db.execute(
  sql`SELECT origin, status, count(*)::int AS n FROM memories GROUP BY origin, status ORDER BY origin NULLS LAST, status`,
)) as unknown as Array<{ origin: string | null; status: string; n: number }>
console.log('origin:status 分布:')
for (const r of rows) console.log(`  origin=${r.origin ?? 'null'} status=${r.status} n=${r.n}`)

process.exit(0)
