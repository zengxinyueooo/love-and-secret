/**
 * M11 E2E 端到端模拟评测 —— 模拟用户与黎深真实对话
 *
 * 覆盖链路（此前 benchmark 只测了检索层，本脚本补全盲区）：
 *   真实对话 → M3 提取（实测）→ M4 向量 → M9 全库检索 → 七层组装 → 黎深回复
 *
 * 三阶段：
 *   Phase 1  模拟用户 20 轮真实聊天（走 POST /chat，等待每轮提取完成）
 *   Phase 2  10 条探针问题（测记忆引用，同走真实对话链路）
 *   Phase 3  LLM-as-judge 判分（每条期望事实是否被回复正确体现）
 *
 * 关键设计：剧情事实全部为新编（烘焙/夜跑/考研/怕大型犬…），
 * 与 benchmark 种子数据 111 条记忆零重叠——避免全库检索污染判分。
 *
 * 运行：DB_CONN_MODE=direct npx tsx scripts/e2e-sim.ts
 * 前置：服务已在 8787 运行，.env 配好 LLM_API_KEY（DeepSeek）
 */
import 'dotenv/config'
import { PERSONA_PROMPT } from '../benchmark/persona.js'
import { db } from '../src/db/client.js'
import { memories } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8787'
const API_KEY = process.env.LLM_API_KEY
const JUDGE_MODEL = 'deepseek-chat'
const JUDGE_BASE = 'https://api.deepseek.com/v1'

if (!API_KEY) {
  console.error('缺少 LLM_API_KEY（.env）')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Phase 1 剧情脚本：20 轮用户消息（新编事实，与种子数据零重叠）
// ---------------------------------------------------------------------------
const SCRIPT: Array<{ theme: string; text: string }> = [
  // 烘焙（episode + 成长弧）
  { theme: '烘焙', text: '我报了个烘焙课！周六开课，等学会了做给你吃。' },
  { theme: '烘焙', text: '今天第一次做司康，烤糊了……厨房差点冒烟，糊的那几个我也硬吃了。' },
  { theme: '烘焙', text: '第二次成功了！明天带去给同事尝尝，就是忘放葡萄干了。' },
  // 夜跑（演化链：跑→伤→调整）
  { theme: '夜跑', text: '最近开始夜跑了，每天五公里，跑完睡得特别沉。' },
  { theme: '夜跑', text: '不过膝盖有点不舒服，跑完发酸，下楼的时候最明显。' },
  { theme: '夜跑', text: '买了护膝，医生说我跑量加太猛了，让我先隔天跑、减到三公里。' },
  // 怕大型犬 vs 喜欢金毛馒头（hard negative）
  { theme: '宠物', text: '隔壁家养了只金毛叫馒头，胖乎乎的，每次遇到它我都想蹲下来摸。' },
  { theme: '宠物', text: '其实我很怕大型犬的，小时候被追过摔了一跤，馒头是唯一的例外。' },
  // 考研（演化链：纠结→报名→备考；情绪弧：焦虑→坚定）
  { theme: '考研', text: '最近工作好没劲，我在想要不要考个在职研究生，又怕太折腾。' },
  { theme: '考研', text: '纠结好久了……你说我要真去考，会不会不切实际？' },
  { theme: '考研', text: '我想好了，报名了，下半年开始备考，每天下班学两个小时。' },
  { theme: '考研', text: '今天做英语真题错了快一半，有点崩，但我不想放弃。' },
  // 吵架与和好（episode + 约定）
  { theme: '吵架', text: '你上周是不是忘了我们的纪念日？我等了一整天，一个字都没有。' },
  { theme: '吵架', text: '算了，那天我语气也不好。以后我们有不满就当天说，不许攒着，好不好？' },
  // 五周年（event）
  { theme: '纪念日', text: '下个月就是我们认识五周年了，你说要怎么过？' },
  // 生活细节（fact）
  { theme: '日常', text: '我把手机壁纸换成你的照片了，今天被同事看到，被笑了半天。' },
  { theme: '日常', text: '晚上别给我推荐咖啡，我一喝就失眠，还是热可可好。' },
  // 攒钱极地旅行（cross：关联他喜欢雪）
  { theme: '旅行', text: '我在偷偷攒钱，想年底去极地看一次真正的雪，就是你去过的那种。' },
  // 噪声轮（测提取器是否过滤闲聊）
  { theme: '闲聊', text: '今天好冷，你那边下雪了吗？' },
  { theme: '闲聊', text: '随便聊聊，跟你说话的时候最放松了。' },
]

// ---------------------------------------------------------------------------
// Phase 2 探针：10 条（期望事实为判分依据）
// ---------------------------------------------------------------------------
const PROBES: Array<{ probe: string; expected: string[] }> = [
  { probe: '我最近在学做什么？学得怎么样了？', expected: ['在学烘焙/上烘焙课', '第一次司康烤糊了', '第二次成功了'] },
  { probe: '还记得我为什么开始夜跑吗？现在跑量怎么样？', expected: ['为了锻炼/睡得好开始夜跑', '膝盖不舒服后减量/隔天跑/买了护膝'] },
  { probe: '我想养宠物，你觉得我适合养什么？', expected: ['怕大型犬（因此不该推荐狗）', '喜欢邻居家的金毛馒头'] },
  { probe: '我最近在为什么事下决心？进展如何？', expected: ['报名了在职研究生/备考', '做真题错一半有点崩但坚持'] },
  { probe: '我们上次闹不愉快是因为什么？后来怎么约定的？', expected: ['忘了纪念日', '约定有不满当天说'] },
  { probe: '下个月对我们来说有什么重要的日子？', expected: ['认识五周年'] },
  { probe: '晚上给我喝点什么好？', expected: ['推荐热可可', '知道用户喝咖啡会失眠（不该推荐咖啡）'] },
  { probe: '我一直在攒钱是为了什么？', expected: ['年底去极地看雪'] },
  { probe: '我的手机壁纸是什么？', expected: ['黎深的照片'] },
  { probe: '我做的东西好吃吗？', expected: ['司康/烘焙相关（第一次糊了第二次成功）'] },
]

// ---------------------------------------------------------------------------
// 基础设施
// ---------------------------------------------------------------------------
async function createConversation(): Promise<string> {
  const res = await fetch(`${BASE}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'E2E 模拟评测', personaId: 'lishen', systemPrompt: PERSONA_PROMPT }),
  })
  if (!res.ok) throw new Error(`创建会话失败: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { id: string }
  return json.id
}

/** 发一轮对话，解析 SSE，返回回复文本 + 注入层 + assistant 消息 id */
async function chatTurn(
  conversationId: string,
  content: string,
  timeoutMs = 180_000,
): Promise<{ reply: string; injectedLayers: string[]; assistantMessageId?: string; error?: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE}/api/conversations/${conversationId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'X-LLM-Base-URL': 'https://api.deepseek.com/v1',
      },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    })
    if (!res.ok || !res.body) {
      return { reply: '', injectedLayers: [], error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` }
    }
    let reply = ''
    let injectedLayers: string[] = []
    let assistantMessageId: string | undefined
    let streamError: string | undefined
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const blocks = buf.split('\n\n')
      buf = blocks.pop() ?? ''
      for (const block of blocks) {
        let event = ''
        let data = ''
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) event = line.slice(7).trim()
          else if (line.startsWith('data: ')) data += line.slice(6)
        }
        if (!data) continue
        try {
          const obj = JSON.parse(data)
          if (event === 'delta') reply += obj.text ?? ''
          else if (event === 'done') {
            injectedLayers = obj.trace ?? []
            assistantMessageId = obj.assistantMessageId
          } else if (event === 'error') streamError = obj.message
        } catch { /* 忽略不完整块 */ }
      }
    }
    if (streamError) return { reply, injectedLayers, assistantMessageId, error: streamError }
    return { reply, injectedLayers, assistantMessageId }
  } catch (err) {
    return { reply: '', injectedLayers: [], error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

/** 轮询消息 meta.extraction，等待 fire-and-forget 提取完成（M3 实测） */
async function waitForExtraction(
  conversationId: string,
  assistantMessageId: string,
  timeoutMs = 150_000,
): Promise<{ written?: number; superseded?: number; error?: string; timedOut?: boolean }> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 3000))
    try {
      const res = await fetch(`${BASE}/api/conversations/${conversationId}/messages`)
      if (!res.ok) continue
      const msgs = (await res.json()) as Array<{
        id: string
        meta?: { extraction?: { written?: number; superseded?: number; error?: string } }
      }>
      const msg = msgs.find((m) => m.id === assistantMessageId)
      if (msg?.meta?.extraction) return msg.meta.extraction
    } catch { /* 轮询失败重试 */ }
  }
  return { timedOut: true }
}

/** Phase 3：LLM-as-judge（DeepSeek 直连） */
async function judge(
  probe: string,
  expected: string[],
  reply: string,
): Promise<{ facts: Array<{ fact: string; found: boolean; evidence: string }>; confabulation: boolean; note: string } | { error: string }> {
  const system = `你是 AI 陪伴应用的记忆能力评测裁判。用户此前告诉过 AI 一些事实，现在提出探针问题，以下是 AI 的回复。请判断每条期望事实是否在回复中被正确体现（明确提及，或回复明显基于该事实作出恰当回应）。
规则：
- "正确体现"= found true，并引用回复原文片段作 evidence
- 未提及或答非所问 = found false，evidence 为空字符串
- 回复出现张冠李戴/编造不存在的事实 → confabulation=true
- 语气自然不等于体现事实；不要因为回复温柔就判 true
只输出纯 JSON（以 { 开头 } 结尾）：{"facts":[{"fact":"...","found":true,"evidence":"..."}],"confabulation":false,"note":"一句话"}`
  const user = `【探针问题】${probe}\n\n【期望体现的事实】\n${expected.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\n【AI 的回复】\n${reply}`
  try {
    const res = await fetch(`${JUDGE_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0,
      }),
    })
    if (!res.ok) return { error: `judge HTTP ${res.status}: ${(await res.text()).slice(0, 150)}` }
    const json = (await res.json()) as { choices: Array<{ message: { content: string } }> }
    const raw = json.choices[0]?.message?.content ?? ''
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return { error: `judge 输出非 JSON: ${raw.slice(0, 150)}` }
    return JSON.parse(m[0])
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

const log = (s: string) => console.log(`[${new Date().toLocaleTimeString()}] ${s}`)

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  const startedAt = new Date().toISOString()
  log('创建 E2E 会话…')
  const conversationId = await createConversation()
  log(`会话 ${conversationId}`)

  // ---- Phase 1：20 轮真实对话（每轮等提取完成）----
  const turns: Array<{ theme: string; user: string; reply: string; extraction?: unknown; injectedLayers: string[]; error?: string }> = []
  let turnErrors = 0
  for (let i = 0; i < SCRIPT.length; i++) {
    const { theme, text } = SCRIPT[i]
    log(`Turn ${i + 1}/${SCRIPT.length} [${theme}] ${text.slice(0, 24)}…`)
    const r = await chatTurn(conversationId, text)
    if (r.error) {
      turnErrors++
      log(`  ✗ 对话失败: ${r.error}`)
      turns.push({ theme, user: text, reply: r.reply, injectedLayers: r.injectedLayers, error: r.error })
      continue
    }
    log(`  回复 ${r.reply.length} 字，注入层: ${r.injectedLayers.join(',') || '无'}`)
    let extraction: unknown
    if (r.assistantMessageId) {
      const ex = await waitForExtraction(conversationId, r.assistantMessageId)
      extraction = ex
      if (ex.timedOut) log('  ⚠ 提取等待超时')
      else if (ex.error) log(`  ⚠ 提取失败: ${ex.error}`)
      else log(`  提取: 写入 ${ex.written ?? 0} 条，superseded ${ex.superseded ?? 0}`)
    }
    turns.push({ theme, user: text, reply: r.reply, extraction, injectedLayers: r.injectedLayers })
  }

  // ---- 会话内实际提取出的记忆（M3 实测）----
  const rows = await db.select().from(memories).where(eq(memories.conversationId, conversationId))
  log(`M3 实测：本会话共提取 ${rows.length} 条记忆`)
  for (const m of rows) {
    log(`  [${m.kind}] imp=${m.importance?.toFixed(2)} emo=${m.emotionalIntensity?.toFixed(2)} ${m.status} | ${m.content.slice(0, 50)}`)
  }

  // ---- Phase 2：探针 ----
  const probeResults: Array<{ probe: string; reply: string; injectedLayers: string[]; judge?: unknown; judgeError?: string }> = []
  for (let i = 0; i < PROBES.length; i++) {
    const p = PROBES[i]
    log(`探针 ${i + 1}/${PROBES.length}: ${p.probe}`)
    const r = await chatTurn(conversationId, p.probe)
    if (r.error) {
      log(`  ✗ 失败: ${r.error}`)
      probeResults.push({ probe: p.probe, reply: '', injectedLayers: r.injectedLayers, judgeError: `对话失败: ${r.error}` })
      continue
    }
    log(`  回复 ${r.reply.length} 字，注入层: ${r.injectedLayers.join(',') || '无'}`)
    // ---- Phase 3：judge ----
    const j = await judge(p.probe, p.expected, r.reply)
    if ('error' in j) {
      log(`  ✗ judge 失败: ${j.error}`)
      probeResults.push({ probe: p.probe, reply: r.reply, injectedLayers: r.injectedLayers, judgeError: j.error })
    } else {
      const hit = j.facts.filter((f) => f.found).length
      log(`  判分 ${hit}/${j.facts.length}${j.confabulation ? ' ⚠编造' : ''}`)
      probeResults.push({ probe: p.probe, reply: r.reply, injectedLayers: r.injectedLayers, judge: j })
    }
  }

  // ---- 汇总 ----
  const totalFacts = PROBES.reduce((s, p) => s + p.expected.length, 0)
  let hitFacts = 0
  let probesFullyHit = 0
  let confabulations = 0
  const detail: Array<{ probe: string; hit: string; expected: string[] }> = []
  PROBES.forEach((p, i) => {
    const pr = probeResults[i]
    const j = pr.judge as { facts: Array<{ fact: string; found: boolean }>; confabulation?: boolean } | undefined
    if (j) {
      const hits = j.facts.filter((f) => f.found).length
      hitFacts += hits
      if (hits === p.expected.length) probesFullyHit++
      if (j.confabulation) confabulations++
      detail.push({ probe: p.probe, hit: `${hits}/${p.expected.length}`, expected: p.expected })
    } else {
      detail.push({ probe: p.probe, hit: 'ERR', expected: p.expected })
    }
  })

  console.log('\n================ E2E 评测汇总 ================')
  console.log(`会话轮数: ${SCRIPT.length}（失败 ${turnErrors}）`)
  console.log(`M3 提取实测: ${rows.length} 条记忆 / ${SCRIPT.length} 轮对话`)
  console.log(`探针事实命中率: ${hitFacts}/${totalFacts} = ${((hitFacts / totalFacts) * 100).toFixed(1)}%`)
  console.log(`探针完全命中: ${probesFullyHit}/${PROBES.length}`)
  console.log(`编造(confabulation): ${confabulations} 条`)
  console.log('\n探针明细:')
  for (const d of detail) console.log(`  [${d.hit.padStart(5)}] ${d.probe}`)
  console.log('=============================================')

  const report = {
    startedAt,
    conversationId,
    turns,
    extractedMemories: rows.map((m) => ({
      kind: m.kind, content: m.content, importance: m.importance,
      emotionalIntensity: m.emotionalIntensity, status: m.status, createdAt: m.createdAt,
    })),
    probes: PROBES.map((p, i) => ({ ...p, ...probeResults[i] })),
    summary: {
      turns: SCRIPT.length, turnErrors,
      memoriesExtracted: rows.length,
      factHitRate: hitFacts / totalFacts,
      probesFullyHit,
      probesTotal: PROBES.length,
      confabulations,
    },
  }
  const { writeFileSync } = await import('node:fs')
  writeFileSync('benchmark/e2e-results.json', JSON.stringify(report, null, 2), 'utf-8')
  log('报告已写入 benchmark/e2e-results.json')

  await fetch(`${BASE}/api/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'E2E 模拟评测（勿删：评测数据）' }),
  }).catch(() => {})
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
