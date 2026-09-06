import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

/**
 * 连接串选择：DB_CONN_MODE=direct 时优先 DIRECT_URL（5432 直连）
 *
 * 为什么要这个开关：
 *   Supabase 的 transaction-mode pooler（6543）偶尔会 CONNECTION_CLOSED / CONNECT_TIMEOUT。
 *   批量脚本（seed / backfill）灌 100+ 条记录时尤其容易触发。
 *   5432 直连并发上限低（免费版约 15），但批量作业更稳。
 *
 * 默认仍是 pooler（生产推荐）。脚本里已默认走 DIRECT_URL（各自的独立连接）。
 */
const preferDirect = process.env.DB_CONN_MODE === 'direct'
const url = (preferDirect && process.env.DIRECT_URL) || process.env.DATABASE_URL
if (!url) {
  throw new Error(
    'DATABASE_URL 未配置：请复制 .env.example 为 .env 并填入 Supabase 连接串',
  )
}

// Supabase pooler (transaction mode) 下 postgres.js 需禁用预备语句
const isPooler = /:6543(\/|$|\?)/.test(url)
const client = postgres(url, {
  prepare: !isPooler,
  // 直连端口并发上限低（Supabase 免费版约 15），池子开小一点避免打满
  max: Number(process.env.DB_POOL_MAX ?? (isPooler ? 10 : 4)),
  idle_timeout: 20,
  // Supabase 项目空闲后会被暂停，首次连接是"冷启动唤醒"，10s 不够，给 30s
  connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT ?? 30),
})

export const db = drizzle(client, { schema })
