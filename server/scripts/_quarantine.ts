import 'dotenv/config'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../src/db/client.js'
import { memories } from '../src/db/schema.js'

const E2E_CONV = 'e182b05e-01f7-4e1f-a617-f6c4466c05e5'
const KEYWORDS = ['肉桂卷', '雪豹', '多肉']
const rows = await db.select().from(memories).where(eq(memories.conversationId, E2E_CONV))
const suspects = rows.filter((m) => KEYWORDS.some((k) => m.content.includes(k)))
for (const m of suspects) {
  console.log(`[${m.status}] ${m.content.slice(0, 70)}`)
}
if (process.argv[2] === 'apply') {
  const ids = suspects.map((m) => m.id)
  if (ids.length) {
    await db
      .update(memories)
      .set({ status: 'unverified', updatedAt: new Date() })
      .where(inArray(memories.id, ids))
    console.log(`\n已隔离 ${ids.length} 条 → unverified`)
  }
}
process.exit(0)
