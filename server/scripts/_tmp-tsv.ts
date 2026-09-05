import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client.js'
const r = await db.execute(sql`SELECT content_tsv IS NOT NULL AS has_tsv, to_tsvector('simple', left(content,20)) AS simple_tsv, left(content, 20) AS c FROM memories LIMIT 2`)
console.log(JSON.stringify(r.rows ?? r, null, 2))
process.exit(0)
