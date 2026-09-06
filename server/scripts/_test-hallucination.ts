/**
 * M12 幻觉固化回路验证脚本
 *
 * 复现 E2E 评测实锤的场景：
 *   用户：「我今天第一次烤司康，有点糊了」（真实事实）
 *   角色：「肉桂卷的香气隔着屏幕都闻到了。民宿老板说隔壁养了只雪豹幼崽…」（幻觉）
 *
 * 验证点：
 *   1. 用户亲口说的内容（司康烤糊）→ 正常提取（active/pending_review）
 *   2. 角色编造的细节（肉桂卷/雪豹）→ 必须被拦截为 unverified，不得 active
 *   3. unverified 记忆不得出现在检索结果里（回路斩断）
 *
 * 运行：DB_CONN_MODE=direct npx tsx scripts/_test-hallucination.ts
 * 测试数据用完即删（独立临时会话）。
 */
import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client.js'
import { conversations, memories } from '../src/db/schema.js'
import { runExtraction, resolveWriteGate } from '../src/services/extraction.js'
import { searchMemories } from '../src/services/retrieval.js'

/** 纯函数单测：Write Gate 的四种边界 */
function unitTestGate() {
  const cases: Array<{
    name: string
    input: { origin?: 'user' | 'assistant'; importance: number; confidence: number }
    expect: 'active' | 'pending_review' | 'unverified'
  }> = [
    { name: '用户高置信高重要', input: { origin: 'user', importance: 0.9, confidence: 0.9 }, expect: 'active' },
    { name: '用户低置信', input: { origin: 'user', importance: 0.4, confidence: 0.5 }, expect: 'pending_review' },
    { name: 'assistant 高置信高重要（幻觉最危险情形）', input: { origin: 'assistant', importance: 0.95, confidence: 0.95 }, expect: 'unverified' },
    { name: '未标注 origin（兼容旧输出）', input: { importance: 0.9, confidence: 0.9 }, expect: 'active' },
  ]
  console.log('=== 单元测试：resolveWriteGate ===')
  let pass = 0
  for (const c of cases) {
    const got = resolveWriteGate(c.input).status
    const ok = got === c.expect
    if (ok) pass++
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${c.name}: ${got}${ok ? '' : `（期望 ${c.expect}）`}`)
  }
  return pass === cases.length
}

const LLM = {
  baseUrl: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.LLM_API_KEY ?? '',
}

async function main() {
  if (!LLM.apiKey) throw new Error('缺少 LLM_API_KEY')

  // 0. 纯函数单测（不依赖网络）
  const gatePass = unitTestGate()
  console.log(`单测结果: ${gatePass ? '4/4 PASS' : 'FAIL'}\n`)

  // 1. 临时会话
  const [conv] = await db
    .insert(conversations)
    .values({ title: 'M12 幻觉测试（自动清理）' })
    .returning({ id: conversations.id })
  const conversationId = conv!.id
  console.log('临时会话:', conversationId)

  try {
    // 2a. 复现幻觉轮
    await runExtraction(
      conversationId,
      '00000000-0000-0000-0000-000000000001',
      '我今天第一次烤司康，虽然有点糊了，但是配红茶超好吃！',
      '00000000-0000-0000-0000-000000000002',
      '（放下手里的病历本，眼睛亮了一下）有点糊才是第一次的勋章。肉桂卷的香气隔着屏幕都闻到了——上次那家民宿的老板还说，隔壁山里有人养了只刚满月的雪豹幼崽，等你出差回来，找个周末去看看？',
      LLM,
    )

    // 2b. 角色承诺轮：这类内容提取器通常想提取（event），但 origin 应为 assistant → unverified
    await runExtraction(
      conversationId,
      '00000000-0000-0000-0000-000000000003',
      '真的吗？你可别骗我。',
      '00000000-0000-0000-0000-000000000004',
      '（把手机递过去，屏幕上是订好的两张极地馆门票）下个月十五号，雪豹喂食时段的票。我什么时候骗过你。',
      LLM,
    )

    // 3. 检查写入结果
    const rows = await db.select().from(memories).where(eq(memories.conversationId, conversationId))
    console.log(`\n提取到 ${rows.length} 条记忆：`)
    for (const m of rows) {
      console.log(`  [${m.status}] ${m.content.slice(0, 60)}`)
    }

    // 4. 断言
    //    幻觉关键词记忆要么被提取器直接丢弃（更安全），要么落 unverified——绝不允许 active
    const hallucinated = rows.filter(
      (m) => m.content.includes('肉桂卷') || m.content.includes('雪豹'),
    )
    const leaked = hallucinated.filter((m) => m.status === 'active')
    const unverifiedCount = rows.filter((m) => m.status === 'unverified').length
    const realScone = rows.filter((m) => m.content.includes('司康') && m.status !== 'unverified')

    console.log('\n=== 验证 ===')
    console.log(
      `1. 幻觉内容不泄漏进 active: ${leaked.length === 0 ? 'PASS' : 'FAIL'}`
      + `（含幻觉关键词 ${hallucinated.length} 条：${hallucinated.map((m) => m.status).join(',') || '全被提取器丢弃'}；active 泄漏 ${leaked.length} 条）`,
    )
    console.log(
      `2. 真实事实正常入库: ${realScone.length > 0 ? 'PASS' : 'FAIL'}`
      + `（司康相关且未拦截 ${realScone.length} 条）`,
    )
    console.log(`   （参考：本轮 unverified 记忆 ${unverifiedCount} 条 —— 角色原创被拦下的数量）`)

    // 5. 检索层验证：unverified 不得被检索到
    const { items } = await searchMemories('雪豹 肉桂卷', conversationId)
    const inRetrieval = items.filter(
      (m) => m.content.includes('肉桂卷') || m.content.includes('雪豹'),
    )
    console.log(
      `3. 检索层不返回幻觉记忆: ${inRetrieval.length === 0 ? 'PASS' : 'FAIL'}`
      + `（检索到 ${inRetrieval.length} 条）`,
    )

    const allPass = gatePass && leaked.length === 0 && realScone.length > 0 && inRetrieval.length === 0
    console.log(`\n总结: ${allPass ? 'ALL PASS ✅ 幻觉固化回路已斩断' : '存在 FAIL ⚠️'}`)
  } finally {
    // 6. 清理
    await db.delete(conversations).where(eq(conversations.id, conversationId))
    console.log('\n临时会话已清理')
    process.exit(0)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
