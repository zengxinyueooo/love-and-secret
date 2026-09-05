import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  doublePrecision,
  customType,
} from 'drizzle-orm/pg-core'

/** pgvector 适配 —— M4 引入，让 Drizzle 能读写 vector(N) 列 */
const vector = (dim: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dim})`
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`
    },
    fromDriver(value: string): number[] {
      return value.slice(1, -1).split(',').map((n) => Number(n))
    },
  })

/** OpenAI text-embedding-3-small 默认维度；换模型时同步改 MIGRATION + 此处 */
export const EMBEDDING_DIM = 1536
export const embedding1536 = vector(EMBEDDING_DIM)

/**
 * 会话表 —— M1
 * 一个会话代表一段持续的对话（按话题/日期切分）
 */
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull().default('新的对话'),
  /** 关联的角色卡 id（前端 persona 定义） */
  personaId: text('persona_id'),
  /** L0 人设层：服务端保存的本会话 system prompt（Context 装配的固定第一层） */
  systemPrompt: text('system_prompt'),
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

/**
 * 记忆表 —— M3
 *
 * 四类记忆：
 *   fact    事实记忆（用户的偏好/习惯/背景，ADD-only + 时态失效）
 *   episode 情景记忆（发生过的具体事件，带原文回链 sourceMessageIds）
 *   emotion 情感记忆（用户的情绪状态与原因）
 *   event   关系事件（纪念日/承诺/里程碑）
 *
 * Temporal Supersession：新旧事实矛盾时不删旧记录，而是
 *   旧记录 status='superseded' + validTo=now，新记录正常写入 —— 历史可追溯。
 *
 * Write Gate 分级写入：
 *   gate='auto'   高置信高重要 → 直接 active
 *   gate='review' 其余 → pending_review，等用户在记忆面板批准/拒绝
 */
export const memories = pgTable(
  'memories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'cascade',
    }),
    kind: text('kind', { enum: ['fact', 'episode', 'emotion', 'event'] }).notNull(),
    /** 记忆正文（保留细节，不做过度压缩） */
    content: text('content').notNull(),
    /** 一句话摘要（可选，供检索结果快速展示） */
    summary: text('summary'),
    /** 原文回链：这条记忆来自哪些 message id（可随时取回完整原文） */
    sourceMessageIds: jsonb('source_message_ids').$type<string[]>().default([]),
    /** 情感权重 0-1：越高遗忘曲线越慢（M5 使用，M3 提取时先打分） */
    importance: doublePrecision('importance').notNull().default(0.5),
    /** 提取置信度 0-1 */
    confidence: doublePrecision('confidence').notNull().default(0.5),
    /** write gate 判定：auto | review */
    gate: text('gate', { enum: ['auto', 'review'] }).notNull().default('auto'),
    /** active | pending_review | rejected | superseded */
    status: text('status', {
      enum: ['active', 'pending_review', 'rejected', 'superseded'],
    })
      .notNull()
      .default('active'),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp('valid_to', { withTimezone: true }),
    /** 被哪条新记忆取代（temporal supersession 回链） */
    supersededBy: uuid('superseded_by'),
    accessCount: integer('access_count').notNull().default(0),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    /** M4：embedding 向量（用于混合检索的语义匹配） */
    embedding: embedding1536('embedding'),
    /** M5：情绪效价 -1~1（这条记忆的情感色彩，正/负/中性） */
    valence: doublePrecision('valence'),
    /** M5：情绪唤醒度 0-1（这条记忆引发的激动程度，0 平静、1 强烈） */
    arousal: doublePrecision('arousal'),
    /** M5：情感强度 0-1（影响遗忘曲线 —— 高情感记忆更难被遗忘） */
    emotionalIntensity: doublePrecision('emotional_intensity').notNull().default(0.5),
    /** M5：情感维度（intimacy/trust/conflict/arousal） */
    emotionalDimension: text('emotional_dimension', {
      enum: ['intimacy', 'trust', 'conflict', 'arousal'],
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('memories_conversation_idx').on(t.conversationId, t.kind, t.status),
    index('memories_status_idx').on(t.status),
  ],
)

/**
 * 章节表 —— M3 Chapter Distillation
 * 每累计 CHAPTER_MIN_TURNS 轮对话，把这段原文蒸馏成章节摘要（填 L4 层）。
 * messageIds 保留回链，摘要太简略时可取回原文。
 */
export const chapters = pgTable(
  'chapters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    chapterIndex: integer('chapter_index').notNull(),
    /** 覆盖的消息 turnIndex 区间 [startTurn, endTurn] */
    startTurn: integer('start_turn').notNull(),
    endTurn: integer('end_turn').notNull(),
    summary: text('summary').notNull(),
    messageIds: jsonb('message_ids').$type<string[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chapters_conversation_idx').on(t.conversationId, t.chapterIndex)],
)

export type Memory = typeof memories.$inferSelect
export type NewMemory = typeof memories.$inferInsert
export type Chapter = typeof chapters.$inferSelect
export type NewChapter = typeof chapters.$inferInsert

/**
 * 关系状态表 —— M5 情感特化层
 *
 * 每个会话维护一份关系快照，三维坐标 + 阶段判断：
 *   intimacy  亲密度  0-1（你们多亲密）
 *   trust     信任度  0-1（你信不信任 ta）
 *   conflict  冲突度  0-1（最近有多少摩擦）
 *   phase     当前关系阶段，由三维自动判断（initial/warming/intimate/conflicted/distant）
 *   version   乐观锁/节流标记
 *
 * 不放事件流（emotional_events 单独存），这里是「当前快照」。
 */
export const relationshipStates = pgTable('relationship_states', {
  conversationId: uuid('conversation_id')
    .primaryKey()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  intimacy: doublePrecision('intimacy').notNull().default(0.5),
  trust: doublePrecision('trust').notNull().default(0.5),
  conflict: doublePrecision('conflict').notNull().default(0.0),
  phase: text('phase', {
    enum: ['initial', 'warming', 'intimate', 'conflicted', 'distant'],
  })
    .notNull()
    .default('initial'),
  version: integer('version').notNull().default(0),
  lastEventAt: timestamp('last_event_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * 情感事件流 —— M5
 *
 * 一条记忆可能被分类为「情感事件」（如表白/吵架/和好/承诺/亲密时刻），
 * 同时记录它对 intimacy/trust/conflict 的影响量 delta（可正可负）。
 *
 * 状态机只需读「最近 N 个事件累计 delta」即可推进关系；
 * 全量事件保留用于「关系发展史」可视化（M7）。
 */
export const emotionalEvents = pgTable(
  'emotional_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    memoryId: uuid('memory_id').references(() => memories.id, {
      onDelete: 'set null',
    }),
    /** 哪个维度：intimacy 亲密度 / trust 信任度 / conflict 冲突度 / arousal 唤醒度 */
    dimension: text('dimension', {
      enum: ['intimacy', 'trust', 'conflict', 'arousal'],
    }).notNull(),
    /** 情绪效价 -1~1（-1 极度负面、0 中性、1 极度正面） */
    valence: doublePrecision('valence'),
    /** 情绪唤醒度 0-1（0 平静、1 强烈激动） */
    arousal: doublePrecision('arousal'),
    /** 事件强度 0-1（影响多深） */
    intensity: doublePrecision('intensity').notNull().default(0.5),
    /** 触发类型：confess 表白 / argument 吵架 / reconcile 和好 / promise 承诺 / milestone 纪念日 / intimate 亲密时刻 / casual 日常 */
    triggerKind: text('trigger_kind').notNull(),
    /** 对三维的影响（json: { intimacy?: +0.1, trust?: -0.05, conflict?: +0.2 }） */
    delta: jsonb('delta').$type<Record<string, number>>().notNull().default({}),
    /** 检测置信度（与记忆 confidence 区分：这是「事件确实是关系事件」的置信度） */
    confidence: doublePrecision('confidence').notNull().default(0.7),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('emotional_events_conv_idx').on(t.conversationId, t.createdAt),
  ],
)

export type RelationshipState = typeof relationshipStates.$inferSelect
export type NewRelationshipState = typeof relationshipStates.$inferInsert
export type EmotionalEvent = typeof emotionalEvents.$inferSelect
export type NewEmotionalEvent = typeof emotionalEvents.$inferInsert
