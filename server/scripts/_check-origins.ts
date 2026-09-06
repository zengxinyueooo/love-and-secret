import 'dotenv/config'
import { db } from '../src/db/client.js'
import { memories } from '../src/db/schema.js'
const rows = await db.select().from(memories)
for (const m of rows) {
  if (m.content.includes('肉桂卷') || m.content.includes('雪豹') || m.content.includes('汤圆') || m.content.includes('多肉')) {
    console.log(m.conversationId?.slice(0, 8), m.createdAt?.toISOString(), '|', m.content.slice(0, 60))
  }
}
console.log('total', rows.length)
process.exit(0)
