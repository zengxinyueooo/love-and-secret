import 'dotenv/config'
import { eq, isNull, sql } from 'drizzle-orm'
import { db } from '../src/db/client.js'
import { memories } from '../src/db/schema.js'

const target = await db.select({ id: memories.id }).from(memories).where(isNull(memories.embedding)).limit(1)
if (target.length === 0) { console.log('no null rows left'); process.exit(0) }

const vec = Array.from({length: 1536}, (_, i) => (i < 4 ? (i+1)/100 : 0))
await db.update(memories).set({ embedding: vec, updatedAt: new Date() }).where(eq(memories.id, target[0].id)).execute()

const chk = await db.execute(sql`SELECT vector_dims(embedding) AS dim FROM memories WHERE id = ${target[0].id}`)
console.log('after drizzle update, dim:', JSON.stringify(chk.rows ?? chk))
process.exit(0)
