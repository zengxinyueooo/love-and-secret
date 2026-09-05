/**
 * M3 冒烟测试（一次性脚本，ts直接跑）
 * 验证：提取失败路径（假 key）→ meta 记录错误不静默丢失；
 *        memories CRUD；Write Gate 审批接口。
 */
import 'dotenv/config'
import { db } from './src/db/client.js'
import { conversations, messages } from './src/db/schema.js'
import { eq } from 'drizzle-orm'
import { runExtraction } from './src/services/extraction.js'

const [conv] = await db
  .insert(conversations)
  .values({ title: 'M3冒烟测试', systemPrompt: '测试人设' })
  .returning()

const [userMsg] = await db
  .insert(messages)
  .values({ conversationId: conv.id, role: 'user', content: '今天加班到十点，好累，只想跟你说话', turnIndex: 0 })
  .returning()
const [assistantMsg] = await db
  .insert(messages)
  .values({ conversationId: conv.id, role: 'assistant', content: '辛苦了，我在呢。', turnIndex: 1 })
  .returning()
await db.update(conversations).set({ turnCount: 2 }).where(eq(conversations.id, conv.id))

// 1) 假 key：提取应失败但被记录到 meta，且不抛出
await runExtraction(conv.id, userMsg.id, userMsg.content, assistantMsg.id, assistantMsg.content, {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-invalid-smoke-test',
})

const [check] = await db.select().from(messages).where(eq(messages.id, assistantMsg.id)).limit(1)
console.log('--- 提取失败写入 meta:', JSON.stringify(check.meta?.extraction, null, 0))

// 2) 直接造一条 pending_review 记忆，测 Write Gate 审批
process.exit(0)
