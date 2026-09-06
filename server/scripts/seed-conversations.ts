/**
 * M8 灌种子数据脚本
 *
 *   npx tsx scripts/seed-conversations.ts            # 灌数据（已存在则跳过）
 *   npx tsx scripts/seed-conversations.ts --reset    # 先清空种子数据再灌
 *   npx tsx scripts/seed-conversations.ts --dry-run  # 只看会灌多少，不写库
 *
 * 幂等设计：所有种子会话打 personaId='seed' 标记，
 *   - 不带 --reset 时，已存在同名种子会话就跳过
 *   - 带 --reset 时，先删 personaId='seed' 的会话（级联删除 messages/memories）
 *
 * 时间轴设计：每个场景有不同的 createdAt 偏移（-90 天 ~ -1 天），
 *   这样 M5 的艾宾浩斯遗忘曲线才有意义——
 *   求职链从三个月前开始，入职是最新的，测「新事实是否压过旧事实」。
 */
import 'dotenv/config'
import { eq, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../src/db/schema.js'
import { conversations, messages, memories, EMBEDDING_DIM } from '../src/db/schema.js'
import { embedBatch, getEmbeddingConfig } from '../src/services/embeddings.js'
import { seedConversations, type SeedMemory } from '../benchmark/seed-data.js'

/**
 * 批量脚本专用连接：优先 DIRECT_URL（5432 直连）
 *
 * 为什么不用 server 默认的 DATABASE_URL（6543 pooler）：
 *   Supabase 的 transaction-mode pooler 对长事务 / 大批量写入不友好，
 *   灌 100+ 条记忆时会出现 CONNECTION_CLOSED / CONNECT_TIMEOUT。
 *   5432 直连虽然并发上限低（Supabase 免费版约 15），但批量作业更稳。
 *
 * 运行时诊断见 scripts/_check.ts
 */
const connUrl = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!connUrl) {
  throw new Error('未配置 DIRECT_URL 或 DATABASE_URL')
}
const sqlClient = postgres(connUrl, {
  prepare: !connUrl.includes('pooler.supabase.com'),
  max: 4,
  idle_timeout: 30,
  connect_timeout: 30,
})
const db = drizzle(sqlClient, { schema })
// 按端口判断连接模式（Supabase 的主机名里都带 pooler，不能用来区分）
const isDirectPort = /:5432(\/|$|\?)/.test(connUrl)
console.log(
  `🔌 连接模式：${isDirectPort ? '直连(5432)' : 'pooler(6543)'} [${
    connUrl === process.env.DIRECT_URL ? 'DIRECT_URL' : 'DATABASE_URL'
  }]`,
)

const SEED_TAG = 'seed'

/** 每个场景的"距今多少天"，用于构造真实时间轴（负=过去） */
const DAY_OFFSETS: Record<string, number> = {
  投简历的那些天: -90,
  终于有回音了: -78,
  面试之后: -70,
  我拿到了: -62,
  入职第一天: -3,
  那束茉莉: -40,
  关灯之后: -25,
  第一次吵架: -55,
  凌晨三点: -12,
  九黎司命: -50,
  雪停的时候: -30,
  在病房醒来: -66,
  搬家的那天: -8,
  答应你去看极光: -18,
  叫我什么: -6,
  第三杯咖啡: -4,
  那只叫汤圆的猫: -20,
  厨房里的两个人: -15,
  生日那天: -35,
  去医院找他: -10,
}

const args = process.argv.slice(2)
const reset = args.includes('--reset')
const dryRun = args.includes('--dry-run')

const daysAgo = (n: number): Date => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

async function main() {
  const totalMemories = seedConversations.reduce((s, c) => s + c.memories.length, 0)
  const totalTurns = seedConversations.reduce((s, c) => s + c.turns.length, 0)

  console.log('=== M8 种子数据 ===')
  console.log(`场景数：${seedConversations.length}`)
  console.log(`对话轮数：${totalTurns}`)
  console.log(`记忆条数：${totalMemories}`)
  console.log(`reset=${reset} dryRun=${dryRun}`)
  console.log('')

  if (dryRun) {
    for (const c of seedConversations) {
      const offset = DAY_OFFSETS[c.title] ?? -30
      console.log(
        `  [${String(offset).padStart(4)}天] ${c.title.padEnd(12)} ${c.turns.length} 轮 / ${c.memories.length} 记忆`,
      )
    }
    console.log('\n(dry-run 模式，未写库)')
    return
  }

  const cfg = getEmbeddingConfig()
  if (!cfg) {
    console.warn('⚠️  未配置 EMBEDDING_API_KEY，将只灌文本不生成向量')
  } else {
    console.log(`embedding 模型：${cfg.model} @ ${cfg.baseUrl} (${cfg.dimensions ?? 'default'} 维)`)
  }
  console.log('')

  // -------------------------------------------------------------------------
  // 0. reset：清掉旧的种子数据
  // -------------------------------------------------------------------------
  if (reset) {
    const existing = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.personaId, SEED_TAG))
    if (existing.length > 0) {
      console.log(`🧹 清理 ${existing.length} 个旧种子会话（级联删除 messages/memories）...`)
      await db.delete(conversations).where(eq(conversations.personaId, SEED_TAG))
    }
  }

  // -------------------------------------------------------------------------
  // 1. 灌会话 + 消息 + 记忆
  // -------------------------------------------------------------------------
  let createdConvs = 0
  let createdMsgs = 0
  const createdMemories: Array<{ id: string; text: string }> = []

  for (const seed of seedConversations) {
    const offset = DAY_OFFSETS[seed.title] ?? -30
    const baseTime = daysAgo(offset)

    // 跳过已存在的
    const existing = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(sql`${conversations.title} = ${seed.title} AND ${conversations.personaId} = ${SEED_TAG}`)
    if (existing.length > 0) {
      console.log(`⏭️  跳过已存在：${seed.title}`)
      continue
    }

    // 建会话
    const [conv] = await db
      .insert(conversations)
      .values({
        title: seed.title,
        personaId: SEED_TAG,
        turnCount: seed.turns.length,
        createdAt: baseTime,
        updatedAt: baseTime,
      })
      .returning()
    createdConvs++

    // 灌消息（每轮间隔 1-3 分钟，模拟真实对话节奏）
    const msgRows = seed.turns.map((t, i) => ({
      conversationId: conv.id,
      role: t.role,
      content: t.content,
      turnIndex: i,
      createdAt: new Date(baseTime.getTime() + i * 90_000),
    }))
    const insertedMsgs = await db.insert(messages).values(msgRows).returning({ id: messages.id })
    createdMsgs += insertedMsgs.length
    const allMsgIds = insertedMsgs.map((m) => m.id)

    // 灌记忆
    for (const mem of seed.memories) {
      // sourceMessageIds：均匀取该会话的 2-3 条消息作为"出处"
      const pickCount = Math.min(3, allMsgIds.length)
      const step = Math.max(1, Math.floor(allMsgIds.length / pickCount))
      const sourceIds = allMsgIds.filter((_, i) => i % step === 0).slice(0, pickCount)

      const [row] = await db
        .insert(memories)
        .values({
          conversationId: conv.id,
          kind: mem.kind,
          content: mem.content,
          summary: mem.summary,
          sourceMessageIds: sourceIds,
          importance: mem.importance,
          confidence: mem.confidence,
          gate: mem.confidence >= 0.9 ? 'auto' : 'review',
          status: mem.status ?? 'active',
          valence: mem.valence ?? null,
          arousal: mem.arousal ?? null,
          emotionalIntensity: mem.emotionalIntensity,
          emotionalDimension: mem.emotionalDimension ?? null,
          // superseded 的记忆补 validTo，让 Temporal Supersession 数据完整
          validFrom: baseTime,
          validTo: mem.status === 'superseded' ? new Date(baseTime.getTime() + 7 * 86400_000) : null,
          createdAt: baseTime,
          updatedAt: baseTime,
        })
        .returning({ id: memories.id })

      // 检索用的文本：内容 + 摘要（与 retrieval 的 embedding 输入保持一致）
      createdMemories.push({
        id: row.id,
        text: [mem.content, mem.summary].filter(Boolean).join(' / '),
      })
    }

    console.log(
      `✅ ${seed.title.padEnd(12)} ${String(offset).padStart(4)}天前 · ${seed.turns.length} 轮 · ${seed.memories.length} 记忆`,
    )
  }

  console.log('')
  console.log(`会话 ${createdConvs} 个 / 消息 ${createdMsgs} 条 / 记忆 ${createdMemories.length} 条`)

  // -------------------------------------------------------------------------
  // 2. 批量生成 embedding
  // -------------------------------------------------------------------------
  if (!cfg || createdMemories.length === 0) {
    console.log('\n⚠️  跳过 embedding 生成')
    await printSummary()
    return
  }

  console.log(`\n🔢 生成 embedding（${createdMemories.length} 条，每批 10 条）...`)
  const BATCH = 10
  let done = 0
  let failed = 0

  for (let i = 0; i < createdMemories.length; i += BATCH) {
    const batch = createdMemories.slice(i, i + BATCH)
    try {
      const result = await embedBatch(
        batch.map((m) => m.text),
        cfg,
      )
      for (let j = 0; j < batch.length; j++) {
        const vec = result.vectors[j]
        if (!vec || vec.length !== EMBEDDING_DIM) {
          console.warn(`  ⚠️  ${batch[j].id} 向量缺失或维度不符（${vec?.length}），跳过`)
          failed++
          continue
        }
        // 用原生 SQL 写 vector 列：drizzle 的 customType 已处理序列化
        await db
          .update(memories)
          .set({ embedding: vec })
          .where(eq(memories.id, batch[j].id))
        done++
      }
      process.stdout.write(`   进度 ${Math.min(i + BATCH, createdMemories.length)}/${createdMemories.length}\r`)
    } catch (err) {
      console.error(`\n  ❌ 批次 ${i / BATCH + 1} 失败:`, err instanceof Error ? err.message : err)
      failed += batch.length
    }
  }

  console.log(`\n   ✅ 成功 ${done} 条，失败 ${failed} 条`)

  await printSummary()
}

async function printSummary() {
  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memories)

  const withVec = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memories)
    .where(sql`${memories.embedding} IS NOT NULL`)

  const byStatus = await db
    .select({
      status: memories.status,
      count: sql<number>`count(*)::int`,
    })
    .from(memories)
    .groupBy(memories.status)

  console.log('\n=== 数据库现状 ===')
  console.log(`记忆总数：${total}`)
  console.log(`有向量：${withVec[0]?.count ?? 0}`)
  console.log('按状态：', byStatus.map((r) => `${r.status}=${r.count}`).join('  '))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ 失败:', err)
    process.exit(1)
  })