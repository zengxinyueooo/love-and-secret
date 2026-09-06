/** 临时：验证记忆再巩固数值逻辑（纯函数，不连库；加载 env 仅为满足 db/client 的导入检查） */
import 'dotenv/config'
import {
  applyReconsolidation,
  computeBoost,
  DEFAULT_RECONSOLIDATION as CFG,
} from '../src/services/reconsolidation.js'

const NOW = new Date('2026-09-06T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail: string) {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}  ${detail}`)
  } else {
    fail++
    console.log(`  ❌ ${name}  ${detail}`)
  }
}

console.log('=== 记忆再巩固数值验证 ===\n')

// 1. 从未访问过 → recency 满额
{
  const b = computeBoost({ current: 0.3, lastAccessedAt: null, now: NOW })
  check(
    '1 从未访问 → 满额强化',
    Math.abs(b - CFG.maxBoost) < 1e-9,
    `Δ=${b.toFixed(4)}（期望 ${CFG.maxBoost}）`,
  )
}

// 2. 昨天刚访问 → 几乎不强化
{
  const b = computeBoost({ current: 0.3, lastAccessedAt: daysAgo(1), now: NOW })
  const expected = CFG.maxBoost * (1 / 7)
  check(
    '2 昨天刚访问 → 微弱强化',
    Math.abs(b - expected) < 1e-9,
    `Δ=${b.toFixed(4)}（期望 ${expected.toFixed(4)}）`,
  )
}

// 3. 一周没访问 → 满额
{
  const b = computeBoost({ current: 0.3, lastAccessedAt: daysAgo(7), now: NOW })
  check('3 一周未访问 → 满额', Math.abs(b - CFG.maxBoost) < 1e-9, `Δ=${b.toFixed(4)}`)
}

// 4. 超过一周 → 仍是满额（不无限增长）
{
  const b = computeBoost({ current: 0.3, lastAccessedAt: daysAgo(100), now: NOW })
  check('4 100 天未访问 → 仍封顶 maxBoost', Math.abs(b - CFG.maxBoost) < 1e-9, `Δ=${b.toFixed(4)}`)
}

// 5. 已到上限 → 0
{
  const b = computeBoost({ current: 1.0, lastAccessedAt: daysAgo(30), now: NOW })
  check('5 已达 1.0 → 不再强化', b === 0, `Δ=${b}`)
}

// 6. 接近上限 → 只涨到上限（边际递减 + headroom 截断）
{
  const r = applyReconsolidation(0.97, 0.9, daysAgo(30), NOW)
  check(
    '6 0.97 强化后不超过 1.0',
    r.emotionalIntensity <= 1.0 && r.emotionalIntensity > 0.97,
    `${(0.97).toFixed(2)} → ${r.emotionalIntensity.toFixed(4)}`,
  )
}

// 7. 低情感记忆 → 不强化
{
  const r = applyReconsolidation(0.2, 0.5, daysAgo(30), NOW)
  check(
    '7 低情感(0.2) → 不强化',
    !r.boosted && r.emotionalIntensity === 0.2,
    `intensity=${r.emotionalIntensity}, boosted=${r.boosted}`,
  )
}

// 8. importance 涨幅应小于 emotionalIntensity
{
  const r = applyReconsolidation(0.5, 0.5, daysAgo(30), NOW)
  const dI = r.emotionalIntensity - 0.5
  const dImp = r.importance - 0.5
  check(
    '8 importance 涨幅 < intensity 涨幅',
    dImp < dI && dImp > 0,
    `Δintensity=${dI.toFixed(4)} vs Δimportance=${dImp.toFixed(4)}`,
  )
}

// 9. 核心对照实验：同样的访问次数，「每天访问」的强化应显著慢于「每周访问」
//    这才是久别重逢加成的真正验证 —— 高频提及不该等同于重要
{
  const simulate = (times: number, gapDays: number) => {
    let intensity = 0.4
    let last: Date | null = null
    for (let i = 0; i < times; i++) {
      const r = applyReconsolidation(intensity, 0.5, last, NOW)
      intensity = r.emotionalIntensity
      last = daysAgo(gapDays)
    }
    return intensity
  }
  const daily = simulate(20, 1)
  const weekly = simulate(20, 7)
  check(
    '9 每天访问 vs 每周访问（各 20 次）',
    weekly > daily && daily < 0.7,
    `每天=${daily.toFixed(3)} < 每周=${weekly.toFixed(3)}（高频提及被抑制 ✓）`,
  )
}

// 9b. 长期每天访问是否会失控冲顶（50 次 ≈ 7 周）
{
  let intensity = 0.4
  let last: Date | null = null
  for (let i = 0; i < 50; i++) {
    const r = applyReconsolidation(intensity, 0.5, last, NOW)
    intensity = r.emotionalIntensity
    last = daysAgo(1)
  }
  check(
    '9b 每天访问 50 次 → 有上界不溢出',
    intensity <= 1.0,
    `0.40 → ${intensity.toFixed(3)}（封顶 1.0）`,
  )
}

// 10. 模拟：每 7 天访问一次，20 次（约 140 天）——应显著增长但收敛
{
  let intensity = 0.4
  let importance = 0.5
  let last: Date | null = null
  for (let i = 0; i < 20; i++) {
    const r = applyReconsolidation(intensity, importance, last, NOW)
    intensity = r.emotionalIntensity
    importance = r.importance
    last = daysAgo(7)
  }
  check(
    '10 每周访问 20 次 → 显著强化且 ≤1.0',
    intensity > 0.6 && intensity <= 1.0,
    `0.40 → ${intensity.toFixed(4)}（久别重逢加成生效）`,
  )
}

// 11. 边界：负值 / 超界输入不应崩
{
  const r = applyReconsolidation(-0.5, 2.0, daysAgo(30), NOW)
  check(
    '11 异常输入被 clamp',
    r.emotionalIntensity >= 0 && r.importance <= 1.0,
    `intensity=${r.emotionalIntensity}, importance=${r.importance}`,
  )
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)