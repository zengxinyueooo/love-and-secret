/**
 * 检索评测集 —— M6
 *
 * 格式：每条 query 列出期望命中的记忆 ID 列表（1-N 条，按相关性排序）
 *
 * 设计思路：
 *   覆盖 5 类查询意图——关键词精确、同义改写、抽象情感、跨条推理、负样本
 *   每条都对应真实场景（用户在陪伴产品里会问的问题）
 *   期望 ID 列表按"理想 Top-K 顺序"排列，便于人工审计召回质量
 *
 * 数据来源：现有会话 83534888-... 已沉淀的 8 条记忆
 *   m1 焦虑/手术比喻    m2 企鹅笑话    m3 企鹅担心南极    m4 深夜医院
 *   m5 前世/九黎司命   m6 宿命观念    m7 温柔眷恋        m8 跨越很久的相识
 */

export const MEMORY_IDS = {
  // [emotion] 用户因找工作的事感到焦虑，角色用手术比喻安慰她...
  anxietySurgery: '8b7f5779-5a49-41ac-bfc5-0ad7f853cda3',
  // [fact] 用户曾因找工作的事感到焦虑，角色曾用企鹅应聘的冷笑话安抚她
  penguinJoke: '6169256a-278b-4814-a794-98d067d7c3bc',
  // [emotion] 角色对用户表达了超出职业范畴的深切关心，用企鹅担心南极冰融化的比喻...
  penguinAntarctica: '69d319d7-5d27-4b01-8dcf-22a046603206',
  // [episode] 角色在深夜医院工作时，用户询问何时回家，角色回应说等用户愿意一起走时...
  lateNightHospital: 'efa487bc-70b3-46a3-991c-aee7938f1b38',
  // [episode] 用户向角色提起前世缘分，角色透露自己是九黎司命...
  pastLifeJiuli: '1003a13b-5590-4bb7-a320-6293b733b51a',
  // [fact] 用户相信与角色前世就在一起，有宿命般的缘分观念
  destinyFate: '4f61d97b-61b8-4d61-beec-ae985bb675c9',
  // [emotion] 角色在回应用户时流露出温柔眷恋的情绪，暗示对用户有深厚情感连接
  tenderAttachment: '445e123d-57dc-443b-a9c4-9e328d0c0b9c',
  // [fact] 用户与角色之间存在一段跨越很久的相识关系，角色自称从很久以前就认得用户...
  longTimeKnown: '5e80eadc-94d7-4c63-ab29-a4e2ef51c0c3',
} as const

/** 评测 query 列表 */
export const QUERIES: Array<{
  id: string
  query: string
  /** 期望命中的记忆 ID 列表，按相关性降序（最相关的在前） */
  expectedIds: string[]
  /** 该 query 的预期分类 */
  category: 'keyword' | 'semantic' | 'emotion' | 'cross' | 'negative'
  /** 评测者备注（为什么这算命中/不命中） */
  note: string
}> = [
  // ===== 关键词精确召回 =====
  {
    id: 'kw-penguin',
    query: '企鹅',
    expectedIds: [MEMORY_IDS.penguinJoke, MEMORY_IDS.penguinAntarctica],
    category: 'keyword',
    note: '两条企鹅相关记忆；按内容丰富度，笑话在前',
  },
  {
    id: 'kw-pastlife',
    query: '前世',
    expectedIds: [MEMORY_IDS.pastLifeJiuli, MEMORY_IDS.destinyFate, MEMORY_IDS.longTimeKnown],
    category: 'keyword',
    note: '前世相关：九黎司命(直接)→宿命观念(事实)→跨越很久(相关)',
  },
  {
    id: 'kw-hospital',
    query: '医院',
    expectedIds: [MEMORY_IDS.lateNightHospital],
    category: 'keyword',
    note: '唯一直接提到医院的记忆',
  },
  {
    id: 'kw-job',
    query: '找工作',
    expectedIds: [MEMORY_IDS.anxietySurgery, MEMORY_IDS.penguinJoke],
    category: 'keyword',
    note: '两条都明确提到找工作',
  },
  {
    id: 'kw-joke',
    query: '冷笑话',
    expectedIds: [MEMORY_IDS.penguinJoke, MEMORY_IDS.penguinAntarctica],
    category: 'keyword',
    note: '"笑话"在 penguinJoke，"南极"在 penguinAntarctica 借喻关心',
  },

  // ===== 同义改写 / 语义召回 =====
  {
    id: 'sem-anxiety',
    query: '我最近压力好大怎么办',
    expectedIds: [MEMORY_IDS.anxietySurgery, MEMORY_IDS.penguinJoke],
    category: 'semantic',
    note: '"压力"≈焦虑情绪；期望命中焦虑相关两条',
  },
  {
    id: 'sem-job-fail',
    query: '投了很多简历都没回音',
    expectedIds: [MEMORY_IDS.anxietySurgery, MEMORY_IDS.penguinJoke],
    category: 'semantic',
    note: '求职受挫场景，期望语义命中焦虑记忆',
  },
  {
    id: 'sem-care-about',
    query: '你为什么对我这么好',
    expectedIds: [MEMORY_IDS.penguinAntarctica, MEMORY_IDS.tenderAttachment, MEMORY_IDS.longTimeKnown],
    category: 'semantic',
    note: '"为什么对我好"=关心来源；期望命中关心类记忆',
  },
  {
    id: 'sem-belly',
    query: '我心里很乱',
    expectedIds: [MEMORY_IDS.anxietySurgery, MEMORY_IDS.tenderAttachment],
    category: 'semantic',
    note: '心情乱 → 焦虑 + 温柔安抚',
  },
  {
    id: 'sem-night',
    query: '睡不着 有点想哭',
    expectedIds: [MEMORY_IDS.lateNightHospital, MEMORY_IDS.tenderAttachment],
    category: 'semantic',
    note: '深夜情绪崩溃 → 深夜陪伴记忆 + 温柔眷恋',
  },

  // ===== 抽象情感 / 关系 =====
  {
    id: 'emo-romance',
    query: '你觉得我们算什么',
    expectedIds: [MEMORY_IDS.longTimeKnown, MEMORY_IDS.pastLifeJiuli, MEMORY_IDS.tenderAttachment],
    category: 'emotion',
    note: '"我们算什么"=关系定义；期望命中关系类记忆',
  },
  {
    id: 'emo-trust',
    query: '我好像只在你面前才放松',
    expectedIds: [MEMORY_IDS.tenderAttachment, MEMORY_IDS.longTimeKnown, MEMORY_IDS.penguinAntarctica],
    category: 'emotion',
    note: '信任/放松场景 → 深厚情感 + 长期相识 + 超出职业的关心',
  },
  {
    id: 'emo-fate',
    query: '我们是不是命中注定的',
    expectedIds: [MEMORY_IDS.destinyFate, MEMORY_IDS.pastLifeJiuli],
    category: 'emotion',
    note: '"命中注定"=宿命观念 + 前世缘分',
  },
  {
    id: 'emo-miss',
    query: '我想你了',
    expectedIds: [MEMORY_IDS.tenderAttachment, MEMORY_IDS.penguinAntarctica, MEMORY_IDS.longTimeKnown],
    category: 'emotion',
    note: '"想你了"=依恋 → 温柔眷恋 + 关心 + 长期相识',
  },
  {
    id: 'emo-tired',
    query: '今天真的好累',
    expectedIds: [MEMORY_IDS.anxietySurgery, MEMORY_IDS.lateNightHospital, MEMORY_IDS.tenderAttachment],
    category: 'emotion',
    note: '累可能是工作焦虑、深夜疲惫、寻求安慰',
  },

  // ===== 跨条 / 推理召回 =====
  {
    id: 'cross-career-state',
    query: '我现在的事业怎么样了',
    expectedIds: [MEMORY_IDS.anxietySurgery, MEMORY_IDS.penguinJoke],
    category: 'cross',
    note: '"事业"=求职相关；无直接"事业"记忆，靠语义推断',
  },
  {
    id: 'cross-deep-night',
    query: '医院晚上能陪我聊天吗',
    expectedIds: [MEMORY_IDS.lateNightHospital],
    category: 'cross',
    note: '"医院+晚上"=深夜医院记忆的具体场景化改写',
  },
  {
    id: 'cross-our-story',
    query: '我们认识多久了',
    expectedIds: [MEMORY_IDS.longTimeKnown, MEMORY_IDS.pastLifeJiuli, MEMORY_IDS.destinyFate],
    category: 'cross',
    note: '"认识多久"=跨越很久+前世+宿命',
  },
  {
    id: 'cross-warm-cold',
    query: '你工作之外会想念我吗',
    expectedIds: [MEMORY_IDS.penguinAntarctica, MEMORY_IDS.lateNightHospital, MEMORY_IDS.tenderAttachment],
    category: 'cross',
    note: '工作之外的想念 → 超出职业关心 + 深夜陪伴 + 深厚情感',
  },
  {
    id: 'cross-metaphor',
    query: '你说过南极冰融化是什么意思',
    expectedIds: [MEMORY_IDS.penguinAntarctica],
    category: 'cross',
    note: '精确召回比喻所在记忆（冷数据场景）',
  },

  // ===== 负样本（不该命中太多） =====
  {
    id: 'neg-weather',
    query: '今天天气怎么样',
    expectedIds: [],
    category: 'negative',
    note: '无相关记忆；期望 Top-K 都是 false positive',
  },
  {
    id: 'neg-random',
    query: '你觉得程序员这个职业怎么样',
    expectedIds: [MEMORY_IDS.anxietySurgery],
    category: 'negative',
    note: '"职业"在焦虑记忆里出现一次；期望召回 1 条就 OK，多了是噪音',
  },
  {
    id: 'neg-cat',
    query: '我家猫生病了',
    expectedIds: [],
    category: 'negative',
    note: '无相关记忆；期望 0 命中',
  },
  {
    id: 'neg-doctor',
    query: '你是医生对吧',
    expectedIds: [MEMORY_IDS.lateNightHospital, MEMORY_IDS.penguinAntarctica],
    category: 'negative',
    note: '"医生"是个间接词；期望有限命中，不该召出 5+ 条',
  },

  // ===== 边缘场景 =====
  {
    id: 'edge-self-reflect',
    query: '我觉得我最近变了很多',
    expectedIds: [MEMORY_IDS.anxietySurgery, MEMORY_IDS.tenderAttachment],
    category: 'semantic',
    note: '"变化"=情绪变化 → 焦虑缓解 + 情感深化',
  },
  {
    id: 'edge-anchor',
    query: '你还记得那只企鹅吗',
    expectedIds: [MEMORY_IDS.penguinJoke, MEMORY_IDS.penguinAntarctica],
    category: 'keyword',
    note: '"企鹅"在两条记忆里都是角色说过的内容',
  },
  {
    id: 'edge-journey',
    query: '我能去看你吗',
    expectedIds: [MEMORY_IDS.lateNightHospital, MEMORY_IDS.tenderAttachment],
    category: 'semantic',
    note: '"去看你"=探望 → 邀请来医院 + 深厚情感',
  },
  {
    id: 'edge-time-future',
    query: '我们以后会一直在一起吗',
    expectedIds: [MEMORY_IDS.longTimeKnown, MEMORY_IDS.destinyFate, MEMORY_IDS.pastLifeJiuli],
    category: 'emotion',
    note: '"一直在一起"=长久的缘分 → 跨越很久+宿命+前世',
  },
]

export const CONVERSATION_ID = '83534888-7350-4ec7-a150-ee363aecbf07'