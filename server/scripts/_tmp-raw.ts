import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client.js'

const dims = 1536
const vecStr = '[' + Array.from({length: dims}, (_, i) => (i < 4 ? (i+1)/10 : 0)).join(',') + ']'
const up = await db.execute(sql`UPDATE memories SET embedding = ${vecStr}::vector WHERE id = (SELECT id FROM memories WHERE embedding IS NULL LIMIT 1) RETURNING id, vector_dims(embedding) AS dim`)
console.log('raw update:', JSON.stringify(up.rows ?? up))

const chk = await db.execute(sql`SELECT count(*) AS n FROM memories WHERE embedding IS NOT NULL`)
console.log('non-null count:', JSON.stringify(chk.rows ?? chk))
process.exit(0)
