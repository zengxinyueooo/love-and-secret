/**
 * M12 对照实验前置：把 M11 E2E 会话的全部记忆隔离为 unverified，
 * 使新跑的 E2E（M12 生效后）与 M11 起跑条件一致：
 *   - 全库检索（status='active'）不再命中 M11 会话产生的任何记忆
 *   - 新会话的提取/写入/探针判分不受 M11 遗留数据污染
 * 可逆：approve 后可转回 active。
 * 运行：npx tsx scripts/_quarantine-m11-all.ts apply
 */
import 'dotenv/config'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/db/client.js'
import { memories } from '../src/db/schema.js'

const E2E_CONV = 'e182b05e-01f7-4e1f-a617-f6c4466c05e5'
const rows = await db.select().from(memories).where(eq(memories.conversationId, E2E_CONV))
const byStatus: Record<string, number> = {}
for (const m of rows) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1
console.log(`M11 会话记忆 ${rows.length} 条：`, JSON.stringify(byStatus))

if (process.argv[2] === 'apply') {
  const ids = rows.filter((m) => m.status === 'active').map((m) => m.id)
  if (ids.length) {
    await db.update(memories).set({ status: 'unverified', updatedAt: new Date() }).where(inArray(memories.id, ids))
    console.log(`已隔离 ${ids.length} 条 active → unverified`)
  } else {
    console.log('无 active 记忆需要隔离')
  }
}
process.exit(0)
