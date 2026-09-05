/**
 * 迁移脚本 —— 手动跑 SQL 文件
 *
 * 用法（用户终端，不要在本环境跑 —— 会撞 safe-delete shim）：
 *   cd server
 *   npx tsx scripts/migrate.ts ../server/drizzle/0002_hybrid_retrieval.sql
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'

const file = process.argv[2]
if (!file) {
  console.error('用法: npx tsx scripts/migrate.ts <sql-file>')
  process.exit(1)
}

const sqlPath = resolve(file)
const sqlText = readFileSync(sqlPath, 'utf8')

const url = process.env.DATABASE_URL
if (!url) {
  console.error('缺少 DATABASE_URL')
  process.exit(1)
}

const isPooler = url.includes('pooler.supabase.com')
const client = postgres(url, { prepare: !isPooler, max: 1 })

console.log(`[migrate] 准备执行: ${sqlPath}`)
console.log(`[migrate] 共 ${sqlText.split(';').filter((s) => s.trim()).length} 条 SQL`)

await client.unsafe(sqlText)
console.log('[migrate] ✓ 执行完成')

await client.end()