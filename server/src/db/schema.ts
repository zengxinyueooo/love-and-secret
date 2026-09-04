import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'

/**
 * 会话表 —— M1
 * 一个会话代表一段持续的对话（按话题/日期切分）
 */
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull().default('新的对话'),
  /** 关联的角色卡 id（前端 persona 定义） */
  personaId: text('persona_id'),
  /** 累计对话轮数（user+assistant 各算 1 条 message，一轮 = 2 条） */
  turnCount: integer('turn_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * 消息表 —— M1
 * 持久化每一条 user/assistant 消息原文
 * turnIndex: 该消息在会话中的全局序号（0,1,2...），Chapter Distillation 按此切割
 * meta: 预留 M2+ 写入 Context Trace（本轮注入了哪些记忆层、token 占用等）
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    content: text('content').notNull(),
    turnIndex: integer('turn_index').notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversationId, t.turnIndex),
  ],
)

export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
