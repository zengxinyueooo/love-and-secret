/** 临时：诊断数据库连接（pooler vs 直连） */
import 'dotenv/config'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'

async function tryConnect(label: string, url: string | undefined) {
  if (!url) {
    console.log(`${label}: 未配置`)
    return false
  }
  const host = url.split('@')[1]?.split('/')[0] ?? '(unknown)'
  const client = postgres(url, {
    prepare: !url.includes('pooler.supabase.com'),
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
  })
  const db = drizzle(client)
  const t0 = Date.now()
  try {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(sql`memories`)
    console.log(`✅ ${label} (${host}) 连接成功，记忆数=${r.n}，耗时 ${Date.now() - t0}ms`)
    await client.end()
    return true
  } catch (e) {
    console.log(`❌ ${label} (${host}) 失败: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
    await client.end().catch(() => {})
    return false
  }
}

async function main() {
  console.log('=== 数据库连接诊断 ===')
  await tryConnect('DATABASE_URL (pooler 6543)', process.env.DATABASE_URL)
  await tryConnect('DIRECT_URL (直连 5432)', process.env.DIRECT_URL)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })