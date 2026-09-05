import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client.js'
const r = await db.execute(sql`
  SELECT kind, left(content, 30) AS content,
         vector_dims(embedding) AS dim,
         embedding IS NOT NULL AS has_vec
  FROM memories ORDER BY created_at DESC LIMIT 10
`)
console.log(JSON.stringify(r.rows ?? r, null, 2))
process.exit(0)
