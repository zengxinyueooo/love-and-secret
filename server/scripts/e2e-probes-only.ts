/**
 * E2E 探针补跑（Phase 1 已完成，服务中途挂掉导致探针全败时用）
 *
 * 复用已有会话（35 条记忆已入库），只跑 Phase 2 探针 + Phase 3 judge，
 * 结果合并回 benchmark/e2e-results.json。
 *
 * 运行：DB_CONN_MODE=direct npx tsx scripts/e2e-probes-only.ts
 */
import 'dotenv/config'
import { writeFileSync, readFileSync } from 'node:fs'
import { PERSONA_PROMPT } from '../benchmark/persona.js'

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8787'
const API_KEY = process.env.LLM_API_KEY
const CONVERSATION_ID = process.argv[2]

if (!API_KEY) {
  console.error('缺少 LLM_API_KEY（.env）')
  process.exit(1)
}
if (!CONVERSATION_ID) {
  console.error('用法: npx tsx scripts/e2e-probes-only.ts <conversationId>')
  process.exit(1)
}

// 与 e2e-sim.ts 完全一致的探针集
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

async function chatTurn(conversationId: string, content: string, timeoutMs = 180_000) {
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
          else if (event === 'done') injectedLayers = obj.trace ?? []
          else if (event === 'error') streamError = obj.message
        } catch { /* 忽略不完整块 */ }
      }
    }
    if (streamError) return { reply, injectedLayers, error: streamError }
    return { reply, injectedLayers }
  } catch (err) {
    return { reply: '', injectedLayers: [], error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

async function judge(probe: string, expected: string[], reply: string) {
  const system = `你是 AI 陪伴应用的记忆能力评测裁判。用户此前告诉过 AI 一些事实，现在提出探针问题，以下是 AI 的回复。请判断每条期望事实是否在回复中被正确体现（明确提及，或回复明显基于该事实作出恰当回应）。
规则：
- "正确体现"= found true，并引用回复原文片段作 evidence
- 未提及或答非所问 = found false，evidence 为空字符串
- 回复出现张冠李戴/编造不存在的事实 → confabulation=true
- 语气自然不等于体现事实；不要因为回复温柔就判 true
只输出纯 JSON（以 { 开头 } 结尾）：{"facts":[{"fact":"...","found":true,"evidence":"..."}],"confabulation":false,"note":"一句话"}`
  const user = `【探针问题】${probe}\n\n【期望体现的事实】\n${expected.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n\n【AI 的回复】\n${reply}`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0,
        }),
      })
      if (!res.ok) throw new Error(`judge HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`)
      const json = (await res.json()) as { choices: Array<{ message: { content: string } }> }
      const raw = json.choices[0]?.message?.content ?? ''
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) throw new Error(`judge 输出非 JSON: ${raw.slice(0, 150)}`)
      return JSON.parse(m[0])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (attempt < 2) {
        console.log(`  judge 重试 ${attempt + 1}: ${msg.slice(0, 80)}`)
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)))
      } else return { error: msg }
    }
  }
  return { error: 'unreachable' }
}

const log = (s: string) => console.log(`[${new Date().toLocaleTimeString()}] ${s}`)

async function main() {
  log(`补跑探针，会话 ${CONVERSATION_ID}`)
  const probeResults: Array<{ probe: string; reply: string; injectedLayers: string[]; judge?: unknown; judgeError?: string }> = []
  for (let i = 0; i < PROBES.length; i++) {
    const p = PROBES[i]
    log(`探针 ${i + 1}/${PROBES.length}: ${p.probe}`)
    const r = await chatTurn(CONVERSATION_ID, p.probe)
    if (r.error) {
      log(`  ✗ 失败: ${r.error}`)
      probeResults.push({ probe: p.probe, reply: '', injectedLayers: r.injectedLayers, judgeError: `对话失败: ${r.error}` })
      continue
    }
    log(`  回复 ${r.reply.length} 字，注入层: ${r.injectedLayers.join(',') || '无'}`)
    const j = await judge(p.probe, p.expected, r.reply)
    if ('error' in j) {
      log(`  ✗ judge 失败: ${j.error}`)
      probeResults.push({ probe: p.probe, reply: r.reply, injectedLayers: r.injectedLayers, judgeError: j.error })
    } else {
      const hit = j.facts.filter((f: { found: boolean }) => f.found).length
      log(`  判分 ${hit}/${j.facts.length}${j.confabulation ? ' ⚠编造' : ''}`)
      probeResults.push({ probe: p.probe, reply: r.reply, injectedLayers: r.injectedLayers, judge: j })
    }
  }

  const totalFacts = PROBES.reduce((s, p) => s + p.expected.length, 0)
  let hitFacts = 0
  let probesFullyHit = 0
  let confabulations = 0
  const detail: Array<{ probe: string; hit: string }> = []
  PROBES.forEach((p, i) => {
    const pr = probeResults[i]
    const j = pr.judge as { facts: Array<{ found: boolean }>; confabulation?: boolean } | undefined
    if (j) {
      const hits = j.facts.filter((f) => f.found).length
      hitFacts += hits
      if (hits === p.expected.length) probesFullyHit++
      if (j.confabulation) confabulations++
      detail.push({ probe: p.probe, hit: `${hits}/${p.expected.length}` })
    } else detail.push({ probe: p.probe, hit: 'ERR' })
  })

  console.log('\n================ 探针补跑汇总 ================')
  console.log(`探针事实命中率: ${hitFacts}/${totalFacts} = ${((hitFacts / totalFacts) * 100).toFixed(1)}%`)
  console.log(`探针完全命中: ${probesFullyHit}/${PROBES.length}`)
  console.log(`编造(confabulation): ${confabulations} 条`)
  for (const d of detail) console.log(`  [${d.hit.padStart(5)}] ${d.probe}`)
  console.log('=============================================')

  // 合并回 e2e-results.json（保留 Phase 1 数据）
  const report = JSON.parse(readFileSync('benchmark/e2e-results.json', 'utf-8'))
  report.probes = PROBES.map((p, i) => ({ ...p, ...probeResults[i] }))
  report.summary.factHitRate = hitFacts / totalFacts
  report.summary.probesFullyHit = probesFullyHit
  report.summary.confabulations = confabulations
  report.summary.probeRerunAt = new Date().toISOString()
  writeFileSync('benchmark/e2e-results.json', JSON.stringify(report, null, 2), 'utf-8')
  log('已合并回 benchmark/e2e-results.json')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
