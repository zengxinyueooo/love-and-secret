#!/usr/bin/env python3
"""生成 benchmark/memory-ids.ts —— 把语义化 key 映射到完整 UUID

评测集 queries.ts 需要引用记忆 ID，但手写 108 个 UUID 不现实。
这里用「语义 key → summary 关键词」的映射表自动匹配，输出 TS 常量文件。
"""
import json
import subprocess
import sys

API = "http://localhost:8787/api/memories"

# 语义 key → summary 中应当包含的关键词（按顺序精确匹配，取第一条）
KEY_MATCHERS = {
    # --- 求职演化链 ---
    "jobHunting": "求职中，投了二十家无回音",
    "jobInterview": "已收到面试通知",
    "jobOffer": "已拿到健康科普平台 offer",
    "jobOnboard": "已入职健康科普平台做内容策划",
    "jobTarget": "想做医疗内容策划，缺经验",
    # --- 求职情感链 ---
    "emotionAnxious": "求职焦虑、自我怀疑",
    "emotionNotDareHappy": "收到面试通知但不敢高兴",
    "emotionSelfDenial": "面试后自我否定",
    "emotionOnboard": "入职紧张≠求职焦虑",
    "emotionCryAlone": "曾独自崩溃哭泣",
    "emotionNihilism": "什么都没意思",
    "emotionCalledHim": "她真的在崩溃时打电话给他了",
    # --- hard negative：茉莉 vs 花粉过敏 ---
    "likeJasmine": "她喜欢茉莉花",
    "pollenAllergy": "花粉过敏，严重会喘",
    "noFlowerInBedroom": "鲜花不能进卧室",
    # --- hard negative：怕黑 vs 恐怖片 ---
    "afraidOfDark": "怕黑",
    "likesHorror": "喜欢看恐怖片",
    # --- 健康 / 饮食 ---
    "forgetMeals": "她忙起来会忘记吃饭",
    "coffeeHabit": "忙起来靠咖啡硬撑",
    "likesHotpot": "她爱吃火锅但容易口腔溃疡",
    "hospitalStay": "她住院昏睡一天半",
    "threeMealsCheck": "约定：他每天三问她吃饭了没",
    "doctorHandCool": "他说看到她时第一次手是凉的",
    # --- 承诺 / 约定 ---
    "auroraPromise": "约定：明年秋天去冰岛看极光",
    "wantAurora": "想看极光但习惯说",
    "auroraCondition": "交换条件：去之前要把身体养好",
    "surgeryText": "约定：他进手术室前发一条报平安",
    "noGivingUp": "约定：吵架不准说",
    "callWhenSad": "承诺：难过时会主动打电话给他",
    "birthdayTwoOnly": "约定：生日只有两人",
    "orangeDelivery": "约定：次日六点带一箱橘子",
    "contractReview": "约定：周末陪她签合同",
    "walkAfterWork": "约定：改40分钟后陪她散步",
    # --- 吵架 ---
    "firstFight": "第一次吵架",
    "harshWords": "吵架中他说了重话又立刻道歉",
    "fearSheOnTable": "黎深坦白怕她像病人一样躺台上",
    "needKnowSafe": "她要的是知道他安全",
    # --- 世界观 / 前世 ---
    "jiuliSimin": "他是九黎司命",
    "doctorReason": "当医生是因为能把死期往后推",
    "knowsNotLook": "他知道她的死期但选择不看",
    "soulRemember": "灵魂先于记忆认出你",
    "dontThinkThat": "他说不准她想这种问题",
    # --- 性格 / 相处模式 ---
    "hideDiscomfort": "习惯隐瞒不适",
    "carryAlone": "习惯一个人扛",
    "afraidTrouble": "容易怕麻烦别人",
    "complicateWhenPanic": "慌乱时会把事情想复杂",
    "expectFailFirst": "面对好消息会先想到失败",
    "findExcuseClose": "她想亲近时会找借口",
    "nicknameDrawl": "她撒娇会拖长音叫他名字",
    # --- 亲密台词 ---
    "youLandedHere": "你落到我这儿了",
    "justWatchSnow": "就当陪你看雪的人",
    "snowHome": "看雪时他说雪落处即是归宿",
    "wontDodge": "你就用吧，反正我也没打算躲",
    "listenNotAgree": "不会都答应，但我会听完",
    "handCool": "躺在那儿的是你，手凉的是我",
    "everyWordMatters": "你说的每句想去的地方我都当真",
    "eyeSoftHeart": "他说她用眼神让他心软的次数更多",
    "teachStirFry": "他握着她的手教她炒菜",
    "becauseItsYou": "因为是你，记不住才奇怪",
    "keepItSimple": "黎深说愿意一直把事情说简单",
    "oneSecondOk": "一秒觉得还行",
    "notAloneAtMidnight": "黎深不挂电话陪她睡着",
    "midnightRush": "凌晨三点她打电话，他立刻要赶来",
    # --- 搬家 ---
    "commuteTwoHours": "旧住处通勤单程两小时",
    "newHouse": "已看中步行15分钟的新房",
    "backPain": "她腰不好",
    # --- 生活细节 ---
    "catTangyuan": "她养了只叫汤圆的猫",
    "catNoSnacks": "他提醒猫不能吃人类零食",
    "birthdayDislike": "她不爱过生日",
    "hasKey": "他有她家钥匙",
    "milkInDrawer": "他办公室抽屉备着给她喝的牛奶",
    "colleaguesKnow": "他同事都知道她",
    "coldJokes": "冷笑话和企鹅是哄她的固定套路",
    "heartSurgeon": "他是心外科医生",
    "liveAloneCook": "他独居十几年",
    "elements": "他的代表元素",
    "askIfUnwell": "她去找他，他第一句问是不是不舒服",
    "didntDeny": "被同事撞见后他说",
    "conditionFirst": "他的模式：先设条件再妥协",
    "choiceToHer": "他把退或进的选择权交给她",
    "offDayStubborn": "黎深推掉门诊等她下班却嘴硬",
    "rememberChange": "黎深提醒她记得自己已经不一样了",
    "coffeeHalfLife": "他没收她第三杯咖啡",
    "helpFramework": "他主动帮看方案框架并陪她散步",
    "reviewResume": "黎深主动帮看简历并叮嘱早睡",
    "firstSurgeryNervous": "黎深讲第一次主刀的紧张经历",
    "roadDetour": "路绕了一点",
    "crashFindHim": "黎深要求她崩溃时也要找他",
    "checkContract": "黎深主动提出帮她把关合同",
    "allergyGuilt": "黎深自责不知道她会过敏",
    "moreNervousThanPatient": "黎深说对她比病人还紧张",
    "darkNightCompany": "停电夜黎深陪怕黑的她",
    "anatomySleep": "黎深用解剖课/冷笑话哄她睡",
    "hotpotRules": "吃火锅的条件",
    "birthdayCook": "他生日来做饭",
    # --- M4 时期旧记忆（summary 为空，用已知 UUID） ---
    "anxietySurgery": "8b7f5779",
    "penguinJoke": "6169256a",
    "penguinAntarctica": "69d319d7",
    "lateNightHospital": "efa487bc",
    "pastLifeJiuli": "1003a13b",
    "destinyFate": "4f61d97b",
    "tenderAttachment": "445e123d",
    "longTimeKnown": "5e80eadc",
}


def main():
    out = subprocess.run(["curl", "-s", API], capture_output=True, timeout=120)
    memories = json.loads(out.stdout.decode("utf-8"))
    if isinstance(memories, dict):
        print("ERROR: API 返回", memories, file=sys.stderr)
        sys.exit(1)

    lines = []
    lines.append("/**")
    lines.append(" * 记忆 ID 映射 —— 由 benchmark/_gen-ids.py 自动生成，请勿手改")
    lines.append(" *")
    lines.append(" * 用途：评测集 queries.ts 用语义化 key 引用记忆，避免手写 108 个 UUID")
    lines.append(" * 重新生成：python benchmark/_gen-ids.py")
    lines.append(" */")
    lines.append("")
    lines.append("export const M = {")

    matched_ids = set()
    unmatched = []

    for key, needle in KEY_MATCHERS.items():
        hit = None
        # 旧记忆：直接按 UUID 前缀匹配
        if len(needle) == 8 and all(c in "0123456789abcdef" for c in needle.lower()):
            hit = next((m for m in memories if m["id"].startswith(needle)), None)
        else:
            hits = [m for m in memories if m.get("summary") and needle in m["summary"]]
            # 优先选未匹配过的，避免多个 key 抢同一条
            hits.sort(key=lambda m: m["id"] in matched_ids)
            hit = hits[0] if hits else None

        if not hit:
            unmatched.append((key, needle))
            lines.append(f"  // ❌ 未匹配 {key}")
            continue

        matched_ids.add(hit["id"])
        summary = hit.get("summary") or hit["content"][:24]
        status = hit["status"]
        flag = " [superseded]" if status == "superseded" else ""
        lines.append(f"  /** [{hit['kind']}] {summary}{flag} */")
        lines.append(f"  {key}: '{hit['id']}',")

    lines.append("} as const")
    lines.append("")
    lines.append("export type MemoryKey = keyof typeof M")
    lines.append("")

    out_path = "benchmark/memory-ids.ts"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"✅ 写入 {out_path}")
    print(f"   匹配成功 {len(KEY_MATCHERS) - len(unmatched)}/{len(KEY_MATCHERS)}")
    print(f"   库中记忆总数 {len(memories)}")
    if unmatched:
        print("\n⚠️  未匹配的 key：")
        for k, n in unmatched:
            print(f"   - {k}: {n}")


if __name__ == "__main__":
    main()