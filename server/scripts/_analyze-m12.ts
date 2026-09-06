/**
 * M12 E2E 对照分析：检查新会话记忆的 origin/status 分布，验证写入闸门效果
 * 运行：npx tsx scripts/_analyze-m12.ts
 */
import 'dotenv/config'
import { eq, and } from 'drizzle-orm'
import { db } from '../src/db/client.js'
import { memories } from '../src/db/schema.js'

const CONV = 'ec545523-aac0-459b-bc25-41b995c49d27'
const rows = await db.select().from(memories).where(eq(memories.conversationId, CONV))

console.log(`\n=== 新会话记忆 ${rows.length} 条 ===`)
const byOrigin: Record<string, number> = {}
for (const m of rows) {
  const key = `${m.origin ?? '(null)'}:${m.status}`
  byOrigin[key] = (byOrigin[key] ?? 0) + 1
}
console.log('origin:status 分布:', JSON.stringify(byOrigin, null, 2))

console.log('\n--- 全部记忆明细 ---')
for (const m of rows) {
  console.log(`[${m.origin ?? '?'}|${m.status}|imp=${m.importance?.toFixed(2)}] ${m.content.slice(0, 60)}`)
}

// 核心断言 1：不存在 assistant-origin 的 active 记忆
const badAuto = rows.filter((m) => m.origin === 'assistant' && m.status === 'active')
console.log(`\n>>> assistant-origin 且 active 的记忆: ${badAuto.length} 条（期望 0）`)
for (const m of badAuto) console.log(`    !! ${m.content.slice(0, 60)}`)

// 核心断言 2：全库 active 记忆中无 M11 假记忆关键词
const fakeKeywords = ['肉桂卷', '雪豹', '多肉']
const allActive = await db.select().from(memories).where(eq(memories.status, 'active'))
const leaked = allActive.filter((m) => fakeKeywords.some((k) => m.content.includes(k)))
console.log(`>>> 全库 ${allActive.length} 条 active 记忆中含假记忆关键词的: ${leaked.length} 条（期望 0）`)
for (const m of leaked) console.log(`    !! [conv=${m.conversationId?.slice(0, 8)}] ${m.content.slice(0, 60)}`)

// 新会话中 assistant-origin 被闸门挡下的记忆（M12 生效证据）
const blocked = rows.filter((m) => m.origin === 'assistant')
console.log(`\n>>> assistant-origin 被写入闸门拦截（unverified）: ${blocked.length} 条`)
for (const m of blocked) console.log(`    [${m.status}] ${m.content.slice(0, 60)}`)

process.exit(0)
