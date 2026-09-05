/** M3 冒烟补充：造一条 pending_review 记忆 */
import 'dotenv/config'
import { db } from './src/db/client.js'
import { memories } from './src/db/schema.js'

const [m] = await db
  .insert(memories)
  .values({
    kind: 'fact',
    content: '她怕黑，睡觉要开小夜灯',
    importance: 0.5,
    confidence: 0.5,
    gate: 'review',
    status: 'pending_review',
  })
  .returning()
console.log('pending memory id:', m.id)
process.exit(0)
