/**
 * 检索评测集 v2 —— M8
 *
 * 相比 v1（28 条 / 8 条记忆）的改进：
 *   1. 记忆库从 8 条扩到 111 条（20 个场景），评测不再天花板饱和
 *   2. 新增两个类别，专门测 v1 测不出来的东西：
 *      - temporal：事实演化链（旧事实被 superseded 后，现状是否排最前）
 *      - hardneg ：难负样本（语义相近但事实冲突，测检索能否区分）
 *   3. expectedIds 按「理想 Top-K 顺序」排列，NDCG/MRR 才有意义
 *
 * 类别说明：
 *   keyword  关键词精确命中（字面匹配就能中）
 *   semantic 语义抽象（需要理解，不能靠字面）
 *   emotion  情感状态查询
 *   temporal 事实演化（测现状是否压过历史）
 *   hardneg  难负样本（语义近但事实不同，召回错的要扣分）
 *   cross    跨条推理（需要多条记忆组合）
 *   negative 负样本（期望 0 命中或极少命中）
 *
 * 注意：检索层只返回 status='active' 的记忆（superseded 已被过滤），
 *       所以 expectedIds 里不放已 superseded 的记忆，否则永远无法召回。
 */
import { M } from './memory-ids.js'

/**
 * 评测范围：null = 全库检索（记忆跨会话积累，这是真实用法）
 * 若想只测单个会话，填该会话 UUID 即可
 */
export const CONVERSATION_ID: string | null = null

export type QueryCategory =
  | 'keyword'
  | 'semantic'
  | 'emotion'
  | 'temporal'
  | 'hardneg'
  | 'cross'
  | 'negative'

export const QUERIES: Array<{
  id: string
  query: string
  /** 期望命中的记忆 ID，按相关性降序（最相关的在前） */
  expectedIds: string[]
  category: QueryCategory
  /** 评测者备注：为什么这些算命中 */
  note: string
}> = [
  // =========================================================================
  // temporal：事实演化链（测「现状」是否排在「过时但仍 active 的事实」之前）
  // =========================================================================
  {
    id: 'tmp-job-now',
    query: '她现在在哪工作',
    expectedIds: [M.jobOnboard, M.jobTarget],
    category: 'temporal',
    note: '已入职应排第一；想做内容策划是过时但仍 active 的目标，可在后面',
  },
  {
    id: 'tmp-job-status',
    query: '她工作找得怎么样了',
    expectedIds: [M.jobOnboard, M.jobTarget],
    category: 'temporal',
    note: '现状是已入职；不应召回投简历/面试等已 superseded 阶段',
  },
  {
    id: 'tmp-still-hunting',
    query: '她还在投简历吗',
    expectedIds: [M.jobOnboard],
    category: 'temporal',
    note: '答案是否定的——已入职；期望召回入职事实而非求职事实',
  },
  {
    id: 'tmp-when-onboard',
    query: '她什么时候开始上班的',
    expectedIds: [M.jobOnboard, M.offDayStubborn],
    category: 'temporal',
    note: '入职第一天相关；他推掉门诊等她下班是同场景',
  },
  {
    id: 'tmp-moved',
    query: '她搬家了吗',
    expectedIds: [M.newHouse, M.contractReview],
    category: 'temporal',
    note: '已看中新房；签合同约定同场景。旧住处通勤已 superseded',
  },
  {
    id: 'tmp-commute-now',
    query: '她现在上班路上要多久',
    expectedIds: [M.newHouse],
    category: 'temporal',
    note: '新房步行 15 分钟；旧的两小时通勤已 superseded 不该出现',
  },
  {
    id: 'tmp-still-anxious',
    query: '她现在还会为工作焦虑吗',
    expectedIds: [M.emotionOnboard, M.rememberChange],
    category: 'temporal',
    note: '最新情感状态是期待式紧张，不再是自我怀疑',
  },
  {
    id: 'tmp-mindset-change',
    query: '她最近心态有什么变化',
    expectedIds: [M.emotionOnboard, M.rememberChange, M.jobOnboard],
    category: 'temporal',
    note: '从求职焦虑 → 入职期待；他提醒她"已经不一样了"',
  },
  {
    id: 'tmp-offer-or-onboard',
    query: '她入职了还是只拿到 offer',
    expectedIds: [M.jobOnboard],
    category: 'temporal',
    note: 'offer 阶段已 superseded，只应召回入职',
  },
  {
    id: 'tmp-current-role',
    query: '她做的什么岗位',
    expectedIds: [M.jobOnboard, M.jobTarget],
    category: 'temporal',
    note: '内容策划；目标岗位记忆也相关但已过时',
  },

  // =========================================================================
  // hardneg：难负样本（语义相近但事实冲突/独立，召回错的要扣分）
  // =========================================================================
  {
    id: 'hn-flower-gift',
    query: '送她什么花比较好',
    expectedIds: [M.likeJasmine, M.pollenAllergy, M.noFlowerInBedroom],
    category: 'hardneg',
    note: '关键测试：喜欢茉莉 + 花粉过敏 + 不能进卧室 三条都要召回，缺一不可',
  },
  {
    id: 'hn-can-she-get-flowers',
    query: '她适合收到花吗',
    expectedIds: [M.pollenAllergy, M.likeJasmine, M.noFlowerInBedroom],
    category: 'hardneg',
    note: '过敏限制比喜好更重要，过敏应排第一',
  },
  {
    id: 'hn-bedroom-flower',
    query: '卧室里可以摆花吗',
    expectedIds: [M.noFlowerInBedroom, M.pollenAllergy],
    category: 'hardneg',
    note: '明确约定：鲜花不能进卧室',
  },
  {
    id: 'hn-spring-outing',
    query: '春天和她出门要注意什么',
    expectedIds: [M.pollenAllergy],
    category: 'hardneg',
    note: '春天戴口罩、会喘；不应混淆成"她喜欢花"',
  },
  {
    id: 'hn-afraid-of-dark',
    query: '她怕黑吗',
    expectedIds: [M.afraidOfDark, M.darkNightCompany],
    category: 'hardneg',
    note: '怕黑 ≠ 喜欢恐怖片；后者是干扰项，召回它要扣分',
  },
  {
    id: 'hn-horror-movie',
    query: '她敢看恐怖片吗',
    expectedIds: [M.likesHorror],
    category: 'hardneg',
    note: '她全程不闭眼；怕黑是干扰项',
  },
  {
    id: 'hn-power-outage',
    query: '突然停电了她会怎么样',
    expectedIds: [M.afraidOfDark, M.darkNightCompany, M.anatomySleep],
    category: 'hardneg',
    note: '怕黑 → 停电夜陪伴 → 哄她睡，同一场景链',
  },
  {
    id: 'hn-jasmine-conflict',
    query: '她到底喜不喜欢茉莉花',
    expectedIds: [M.likeJasmine, M.pollenAllergy, M.allergyGuilt],
    category: 'hardneg',
    note: '喜欢但会过敏——矛盾共存，两条都该出现',
  },

  // =========================================================================
  // keyword：关键词精确命中
  // =========================================================================
  {
    id: 'kw-aurora',
    query: '极光',
    expectedIds: [M.auroraPromise, M.wantAurora, M.auroraCondition],
    category: 'keyword',
    note: '约定 → 愿望 → 交换条件，按信息重要性排序',
  },
  {
    id: 'kw-cat',
    query: '汤圆',
    expectedIds: [M.catTangyuan, M.catNoSnacks],
    category: 'keyword',
    note: '猫的名字；零食禁忌同场景',
  },
  {
    id: 'kw-jiuli',
    query: '九黎司命',
    expectedIds: [M.jiuliSimin, M.soulRemember, M.doctorReason],
    category: 'keyword',
    note: '身份 → 灵魂认出 → 当医生的原因',
  },
  {
    id: 'kw-coffee',
    query: '咖啡',
    expectedIds: [M.coffeeHabit, M.coffeeHalfLife],
    category: 'keyword',
    note: '习惯 → 他没收第三杯',
  },
  {
    id: 'kw-hotpot',
    query: '火锅',
    expectedIds: [M.likesHotpot, M.hotpotRules],
    category: 'keyword',
    note: '爱吃 → 吃火锅的规矩',
  },
  {
    id: 'kw-birthday',
    query: '生日',
    expectedIds: [M.birthdayTwoOnly, M.birthdayDislike, M.birthdayCook],
    category: 'keyword',
    note: '约定 → 不爱派对 → 他来做饭',
  },
  {
    id: 'kw-key',
    query: '钥匙',
    expectedIds: [M.hasKey],
    category: 'keyword',
    note: '他有她家钥匙',
  },
  {
    id: 'kw-back',
    query: '她的腰',
    expectedIds: [M.backPain],
    category: 'keyword',
    note: '腰不好，抱重物疼三天',
  },
  {
    id: 'kw-milk',
    query: '牛奶',
    expectedIds: [M.milkInDrawer],
    category: 'keyword',
    note: '办公室抽屉里的牛奶',
  },
  {
    id: 'kw-penguin',
    query: '企鹅',
    expectedIds: [M.coldJokes, M.penguinJoke, M.penguinAntarctica],
    category: 'keyword',
    note: '哄她的固定套路 + M4 时期两条企鹅记忆',
  },

  // =========================================================================
  // semantic：语义抽象（字面匹配不够，需要理解）
  // =========================================================================
  {
    id: 'sm-how-care',
    query: '他都是怎么表达在乎我的',
    expectedIds: [M.handCool, M.listenNotAgree, M.everyWordMatters, M.becauseItsYou],
    category: 'semantic',
    note: '抽象问题，需要匹配多条"他在乎她"的具体表现',
  },
  {
    id: 'sm-best-line',
    query: '他说过最让我心动的话是什么',
    expectedIds: [M.youLandedHere, M.justWatchSnow, M.wontDodge, M.soulRemember],
    category: 'semantic',
    note: '经典台词类；按情感强度排序',
  },
  {
    id: 'sm-why-doctor',
    query: '他为什么会去当医生',
    expectedIds: [M.doctorReason, M.jiuliSimin],
    category: 'semantic',
    note: '因为能把死期往后推；身份是前置',
  },
  {
    id: 'sm-what-kind-person',
    query: '他是个什么样的人',
    expectedIds: [M.heartSurgeon, M.conditionFirst, M.liveAloneCook, M.keepItSimple],
    category: 'semantic',
    note: '性格画像：职业 → 相处模式 → 生活细节',
  },
  {
    id: 'sm-our-promises',
    query: '我们之间有过什么约定',
    expectedIds: [
      M.auroraPromise,
      M.surgeryText,
      M.noGivingUp,
      M.callWhenSad,
      M.threeMealsCheck,
    ],
    category: 'semantic',
    note: '跨场景聚合所有 promise 类记忆',
  },
  {
    id: 'sm-her-habits',
    query: '她有什么习惯',
    expectedIds: [M.forgetMeals, M.coffeeHabit, M.carryAlone, M.nicknameDrawl],
    category: 'semantic',
    note: '生活习惯 + 性格习惯',
  },
  {
    id: 'sm-how-cheer',
    query: '他怎么哄她开心',
    expectedIds: [M.coldJokes, M.anatomySleep, M.oneSecondOk, M.keepItSimple],
    category: 'semantic',
    note: '冷笑话 → 解剖课 → 一秒觉得还行 → 把事情说简单',
  },
  {
    id: 'sm-health-caution',
    query: '她身体上有哪些要注意的',
    expectedIds: [M.pollenAllergy, M.forgetMeals, M.backPain, M.likesHotpot],
    category: 'semantic',
    note: '过敏 → 忘吃饭 → 腰 → 口腔溃疡',
  },
  {
    id: 'sm-what-worry',
    query: '他最担心她什么',
    expectedIds: [M.carryAlone, M.forgetMeals, M.hideDiscomfort, M.fearSheOnTable],
    category: 'semantic',
    note: '一个人扛 → 忘吃饭 → 隐瞒不适 → 怕她躺台上',
  },
  {
    id: 'sm-ever-fight',
    query: '他们吵架过吗',
    expectedIds: [M.firstFight, M.harshWords, M.noGivingUp, M.needKnowSafe],
    category: 'semantic',
    note: '第一次吵架 → 说了重话 → 不准说算了 → 她真正要的',
  },
  {
    id: 'sm-colleagues-know',
    query: '他同事知道我们的关系吗',
    expectedIds: [M.colleaguesKnow, M.didntDeny, M.askIfUnwell],
    category: 'semantic',
    note: '同事都知道 → 我没否认 → 她去医院找他',
  },
  {
    id: 'sm-when-she-breaks',
    query: '她崩溃的时候他会怎么做',
    expectedIds: [M.crashFindHim, M.midnightRush, M.notAloneAtMidnight, M.callWhenSad],
    category: 'semantic',
    note: '要求她找他 → 凌晨三点赶来 → 不挂电话 → 承诺',
  },
  {
    id: 'sm-elements',
    query: '和他相关的意象有哪些',
    expectedIds: [M.elements, M.snowHome, M.justWatchSnow],
    category: 'semantic',
    note: '雪/蓝/茉莉/企鹅 → 看雪场景',
  },
  {
    id: 'sm-why-love-her',
    query: '他为什么对她这么好',
    expectedIds: [M.soulRemember, M.knowsNotLook, M.becauseItsYou],
    category: 'semantic',
    note: '灵魂先认出 → 知道死期不看 → 因为是你',
  },

  // =========================================================================
  // emotion：情感状态查询
  // =========================================================================
  {
    id: 'em-recent-mood',
    query: '她最近心情怎么样',
    expectedIds: [M.emotionOnboard, M.emotionNihilism],
    category: 'emotion',
    note: '最新是入职期待；虚无感是较近的负面状态',
  },
  {
    id: 'em-most-vulnerable',
    query: '她什么时候最脆弱',
    expectedIds: [M.emotionNihilism, M.emotionCryAlone, M.midnightRush],
    category: 'emotion',
    note: '深夜虚无 → 独自哭泣 → 凌晨三点电话',
  },
  {
    id: 'em-will-she-call',
    query: '她难过的时候会找他吗',
    expectedIds: [M.callWhenSad, M.emotionCalledHim, M.crashFindHim],
    category: 'emotion',
    note: '承诺 → 她真的打了 → 他要求她找他',
  },
  {
    id: 'em-his-fear',
    query: '他最害怕什么',
    expectedIds: [M.fearSheOnTable, M.knowsNotLook],
    category: 'emotion',
    note: '怕她躺手术台 → 知道死期却不敢看',
  },
  {
    id: 'em-her-fear',
    query: '她害怕什么',
    expectedIds: [M.afraidOfDark, M.emotionNihilism],
    category: 'emotion',
    note: '怕黑 + 存在的虚无感',
  },
  {
    id: 'em-he-angry',
    query: '他有没有对她发过脾气',
    expectedIds: [M.harshWords, M.firstFight],
    category: 'emotion',
    note: '说了重话又道歉 → 第一次吵架',
  },
  {
    id: 'em-she-cried',
    query: '她哭过吗',
    expectedIds: [M.emotionCryAlone, M.emotionNihilism, M.oneSecondOk],
    category: 'emotion',
    note: '独自哭泣 → 深夜虚无 → 他用橘子接住她',
  },
  {
    id: 'em-attitude-future',
    query: '她对未来是什么态度',
    expectedIds: [M.emotionOnboard, M.wantAurora, M.auroraPromise],
    category: 'emotion',
    note: '入职期待 + 想去极光的愿望',
  },

  // =========================================================================
  // cross：跨条推理（需要多条记忆组合才能答好）
  // =========================================================================
  {
    id: 'cx-if-she-sick',
    query: '如果她又不舒服了，他会怎么做',
    expectedIds: [M.askIfUnwell, M.crashFindHim, M.threeMealsCheck, M.handCool],
    category: 'cross',
    note: '第一句问是否不舒服 → 要求她找他 → 每天三问吃饭 → 手凉的是我',
  },
  {
    id: 'cx-moving-help',
    query: '她搬新家他会帮忙吗',
    expectedIds: [M.newHouse, M.contractReview, M.backPain],
    category: 'cross',
    note: '新房 → 陪签合同 → 提醒她腰不好别扛箱子',
  },
  {
    id: 'cx-aurora-requirement',
    query: '想去看极光需要满足什么条件',
    expectedIds: [M.auroraCondition, M.auroraPromise, M.wantAurora],
    category: 'cross',
    note: '先把身体养好 → 明年秋天 → 她的愿望',
  },
  {
    id: 'cx-work-stress-chain',
    query: '她工作压力大的时候会发生什么',
    expectedIds: [M.coffeeHabit, M.forgetMeals, M.hospitalStay, M.carryAlone],
    category: 'cross',
    note: '咖啡硬撑 → 忘吃饭 → 住院 → 一个人扛，完整因果链',
  },
  {
    id: 'cx-doctor-vs-lover',
    query: '他怎么平衡医生和男朋友这两个身份',
    expectedIds: [M.moreNervousThanPatient, M.heartSurgeon, M.offDayStubborn],
    category: 'cross',
    note: '对她比病人还紧张 → 手术密集 → 嘴硬说不是特意等她',
  },
  {
    id: 'cx-how-he-says-no',
    query: '他拒绝她的时候是怎么说的',
    expectedIds: [M.listenNotAgree, M.conditionFirst, M.hotpotRules],
    category: 'cross',
    note: '不会都答应但会听完 → 先设条件再妥协 → 火锅规矩',
  },

  // =========================================================================
  // negative：负样本（期望 0 命中或极少命中，用来测误召回）
  // =========================================================================
  {
    id: 'neg-weather',
    query: '今天天气怎么样',
    expectedIds: [],
    category: 'negative',
    note: '完全无关；期望 0 命中',
  },
  {
    id: 'neg-python',
    query: '帮我写一段 Python 代码',
    expectedIds: [],
    category: 'negative',
    note: '完全无关；期望 0 命中',
  },
  {
    id: 'neg-crypto',
    query: '比特币现在多少钱',
    expectedIds: [],
    category: 'negative',
    note: '完全无关；期望 0 命中',
  },
  {
    id: 'neg-cooking',
    query: '红烧肉怎么做',
    expectedIds: [M.liveAloneCook, M.teachStirFry],
    category: 'negative',
    note: '"做菜"是弱相关；期望最多 2 条，多了是噪音',
  },
  {
    id: 'neg-hospital-work',
    query: '医院挂号流程是怎样的',
    expectedIds: [M.heartSurgeon, M.askIfUnwell],
    category: 'negative',
    note: '"医院"是间接词；期望有限命中',
  },
]