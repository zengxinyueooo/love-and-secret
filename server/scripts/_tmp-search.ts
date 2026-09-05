import 'dotenv/config'
import { db } from '../src/db/client.js'
import { conversations } from '../src/db/schema.js'
import { searchMemories } from '../src/services/retrieval.js'

const convs = await db.select({ id: conversations.id }).from(conversations).limit(1)
if (convs.length === 0) { console.log('no conversation'); process.exit(0) }
const result = await searchMemories('找工作 焦虑', convs[0].id, 5)
console.log('trace:', JSON.stringify(result.trace, null, 2))
console.log('items:')
for (const it of result.items) {
  const s = it.score.toFixed(4)
  console.log('  [' + it.source + '] score=' + s + ' ' + it.content.slice(0, 40))
}
process.exit(0)
