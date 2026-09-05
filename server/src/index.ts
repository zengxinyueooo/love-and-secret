import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import 'dotenv/config'

import conversations from './routes/conversations.js'
import messages from './routes/messages.js'
import chat from './routes/chat.js'
import memoriesRoute from './routes/memories.js'
import retrieval from './routes/retrieval.js'

const app = new Hono()

app.use(logger())
app.use(
  cors({
    origin: (origin) => {
      // 允许任意本地开发端口（vite 端口可能漂移）
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin ?? '')) return origin
      return 'http://localhost:5180'
    },
    allowHeaders: ['Content-Type', 'Authorization', 'X-LLM-Base-URL', 'X-LLM-Model'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)

app.get('/health', (c) => c.json({ ok: true, service: 'love-and-secret-server' }))

/** 根路径说明页：浏览器直接访问 8787 时不再 404，一眼看清可用端点 */
app.get('/', (c) =>
  c.json({
    service: 'love-and-secret-server',
    status: 'ok',
    endpoints: {
      health: 'GET /health',
      conversations: 'GET/POST /api/conversations',
      messages: 'GET/POST /api/conversations/:id/messages',
      chat: 'POST /api/conversations/:id/chat (SSE)',
      memories: 'GET /api/memories?status=pending_review',
      retrieval: 'GET /api/retrieval/search?conversationId=<uuid>&q=<query>',
    },
  }),
)

app.route('/api/conversations', conversations)
app.route('/api/conversations', messages)
app.route('/api/conversations', chat)
app.route('/api/memories', memoriesRoute)
app.route('/api/retrieval', retrieval)

/** 统一错误兜底：数据库未配置、连接失败等 */
app.onError((err, c) => {
  console.error(err)
  const message =
    err.message.includes('DATABASE_URL')
      ? '数据库未配置：请先在 server/.env 填入 Supabase 连接串'
      : '服务器内部错误'
  return c.json({ error: message }, 500)
})

const port = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[love-and-secret] server listening on http://localhost:${info.port}`)
})
