import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error(
    'DATABASE_URL 未配置：请复制 .env.example 为 .env 并填入 Supabase 连接串',
  )
}

// Supabase pooler (transaction mode) 下 postgres.js 需禁用预备语句
const isPooler = url.includes('pooler.supabase.com')
const client = postgres(url, {
  prepare: !isPooler,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
})

export const db = drizzle(client, { schema })
