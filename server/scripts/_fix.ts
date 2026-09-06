/** 临时：删除未灌完整的种子会话，便于重跑补上 */
import 'dotenv/config'
import { eq, and, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../src/db/schema.js'
import { conversations, memories } from '../src/db/schema.js'

const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!
const client = postgres(connUrl, {
  prepare: !connUrl.includes('pooler.supabase.com'),
  max: 4,
  connect_timeout: 30,
})
const db = drizzle(client, { schema })

const target = '搬家的那天'

async function main() {
  // 先看这个会话当前有几条记忆
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.personaId, 'seed'), eq(conversations.title, target)))

  if (!conv) {
    console.log(`会话「${target}」不存在（可能已被删）`)
    await client.end()
    return
  }

  const before = await db
    .select({ id: memories.id, summary: memories.summary })
    .from(memories)
    .where(eq(memories.conversationId, conv.id))

  console.log(`会话「${target}」当前 ${before.length} 条记忆：`)
  for (const m of before) console.log('  -', m.summary)

  await db.delete(conversations).where(eq(conversations.id, conv.id))
  console.log(`\n🗑️  已删除会话（级联删除 ${before.length} 条记忆）`)

  const [{ n: total }] = await db.select({ n: sql<number>`count(*)::int` }).from(memories)
  console.log(`库中剩余记忆：${total}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })