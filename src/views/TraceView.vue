<script setup lang="ts">
/**
 * Trace 面板 —— M6
 *
 * 把 M2 装配器每次发给 LLM 的七层 Context Trace 可视化：
 *   - 每轮 assistant 消息的 trace 展开后看到
 *   - 每层字符数 / 来源 / 是否注入 / 来源版本
 *   - L5 检索命中明细（kind / content / score / 召回通道）
 *   - LLM 调用元数据（model / retries / 耗时）
 *
 * 纯前端不依赖新接口，直接读 GET /api/conversations/:id/messages
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TraceMessage, ContextTrace, TraceLayer } from '../types'

const route = useRoute()
const router = useRouter()
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:8787'

const conversations = ref<Array<{ id: string; title: string }>>([])
const activeId = ref<string>('')
const messages = ref<TraceMessage[]>([])
const loading = ref(false)
const expanded = ref<Record<string, boolean>>({})

const conversationId = computed(() => (route.params.id as string) || activeId.value)

async function loadConversations() {
  try {
    const resp = await fetch(`${API_BASE}/api/conversations`)
    if (!resp.ok) return
    conversations.value = await resp.json()
    if (conversations.value.length > 0 && !activeId.value) {
      activeId.value = conversations.value[0].id
    }
  } catch (e) {
    console.warn('loadConversations failed:', e)
  }
}

async function loadMessages() {
  const cid = conversationId.value
  if (!cid) return
  loading.value = true
  try {
    const resp = await fetch(`${API_BASE}/api/conversations/${cid}/messages`)
    if (!resp.ok) {
      messages.value = []
      return
    }
    messages.value = await resp.json()
  } catch (e) {
    console.warn('loadMessages failed:', e)
    messages.value = []
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadConversations()
  await loadMessages()
})

watch(conversationId, async () => {
  await loadMessages()
})

function switchConversation(id: string) {
  router.push(`/trace/${id}`)
}

function toggleExpand(id: string) {
  expanded.value[id] = !expanded.value[id]
}

/** 把用户消息和对应 assistant 消息配对 */
const pairs = computed(() => {
  const result: Array<{ user: TraceMessage | null; assistant: TraceMessage | null; key: string }> = []
  for (let i = 0; i < messages.value.length; i++) {
    const m = messages.value[i]
    if (m.role === 'user') {
      result.push({ user: m, assistant: messages.value[i + 1]?.role === 'assistant' ? messages.value[i + 1] : null, key: m.id })
    }
  }
  return result
})

/** Trace 层标题 */
const LAYER_LABELS: Record<string, { name: string; icon: string; desc: string }> = {
  persona: { name: 'L0 人设', icon: '🎭', desc: '会话人设卡（常驻）' },
  relationship: { name: 'L1 关系', icon: '💞', desc: '当前关系快照 + 最近变化' },
  ongoing: { name: 'L2 进展中', icon: '🔄', desc: '最近的话题/承诺' },
  summary: { name: 'L4 章节摘要', icon: '📚', desc: '最近 N 章蒸馏' },
  retrieved: { name: 'L5 检索记忆', icon: '🔍', desc: '混合检索召回' },
  lore: { name: 'L6 世界书', icon: '📖', desc: '角色设定补充' },
  recent: { name: 'L3 近期对话', icon: '💬', desc: '滚动窗口内原文' },
}

function layerLabel(layer: string) {
  return LAYER_LABELS[layer] ?? { name: layer, icon: '•', desc: '' }
}

function layerChars(l: TraceLayer): string {
  return l.chars === 0 ? '∅' : `${l.chars} 字`
}

/** 计算每个会话的 trace 总览 */
const sessionOverview = computed(() => {
  const list = messages.value.filter((m) => m.role === 'assistant' && m.meta?.trace)
  if (list.length === 0) return null
  const layerCounts: Record<string, number> = {}
  let totalChars = 0
  let totalElapsed = 0
  let l5Hits = 0
  let l5VectorHits = 0
  for (const m of list) {
    const t = m.meta!.trace!
    for (const l of t.layers) {
      if (l.injected) layerCounts[l.layer] = (layerCounts[l.layer] || 0) + 1
    }
    totalChars += t.totalChars
    totalElapsed += t.elapsedMs
    if (t.retrievalStats?.hits) l5Hits += t.retrievalStats.hits
    if (t.retrievalStats?.vectorEnabled) l5VectorHits += 1
  }
  return {
    traceCount: list.length,
    layerCounts,
    avgTotalChars: Math.round(totalChars / list.length),
    avgElapsed: Math.round(totalElapsed / list.length),
    l5AvgHits: (l5Hits / list.length).toFixed(1),
    l5VectorRate: ((l5VectorHits / list.length) * 100).toFixed(0) + '%',
    latestVersion: list[list.length - 1]?.meta?.trace?.version,
  }
})

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function scoreColor(score: number): string {
  // score 范围通常 [0, 1] 但实际很小，用相对判断
  if (score > 0.0001) return 'text-emerald-600'
  if (score > 0.00005) return 'text-amber-600'
  return 'text-gray-400'
}
</script>

<template>
  <div class="min-h-[calc(100vh-64px)] bg-bg-main p-4 md:p-6">
    <div class="container mx-auto max-w-5xl">
      <!-- 头部 -->
      <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-3">
        <h1 class="text-2xl md:text-3xl font-bold text-gray-800">🛰️ Context Trace 面板</h1>
        <div class="flex items-center gap-2">
          <select
            v-if="conversations.length > 1"
            :value="conversationId"
            @change="(e) => switchConversation((e.target as HTMLSelectElement).value)"
            class="text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary"
          >
            <option v-for="c in conversations" :key="c.id" :value="c.id">{{ c.title }}</option>
          </select>
          <span class="text-xs text-gray-500">{{ messages.length }} 条消息</span>
        </div>
      </div>

      <!-- 会话总览 -->
      <div v-if="sessionOverview" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="card text-center">
          <div class="text-xs text-gray-500 mb-1">有 trace 的轮次</div>
          <div class="text-xl font-bold text-primary">{{ sessionOverview.traceCount }}</div>
        </div>
        <div class="card text-center">
          <div class="text-xs text-gray-500 mb-1">平均 prompt 字符</div>
          <div class="text-xl font-bold text-primary">{{ sessionOverview.avgTotalChars }}</div>
        </div>
        <div class="card text-center">
          <div class="text-xs text-gray-500 mb-1">平均装配耗时</div>
          <div class="text-xl font-bold text-primary">{{ sessionOverview.avgElapsed }}ms</div>
        </div>
        <div class="card text-center">
          <div class="text-xs text-gray-500 mb-1">L5 平均命中 / 向量可用率</div>
          <div class="text-xl font-bold text-primary">{{ sessionOverview.l5AvgHits }} / {{ sessionOverview.l5VectorRate }}</div>
        </div>
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="text-center py-12 text-gray-400">加载中...</div>

      <!-- 无数据 -->
      <div v-else-if="pairs.length === 0" class="text-center py-12">
        <div class="text-5xl mb-4">📭</div>
        <p class="text-gray-500">该会话还没有对话记录</p>
      </div>

      <!-- Trace 时间线 -->
      <div v-else class="space-y-3">
        <div
          v-for="pair in pairs"
          :key="pair.key"
          class="card overflow-hidden"
        >
          <!-- 摘要行：用户问题 + assistant 回答 + 概要 -->
          <button
            @click="pair.assistant && toggleExpand(pair.assistant.id)"
            class="w-full text-left p-4 hover:bg-gray-50/60 transition-colors"
            :disabled="!pair.assistant"
          >
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 mt-1">
                <span class="inline-block w-7 h-7 rounded-full bg-gradient-to-br from-pink-400 to-rose-400 text-white text-center leading-7 text-sm">U</span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-gray-700 truncate">{{ pair.user?.content || '(空消息)' }}</p>
                <p v-if="pair.assistant" class="text-sm text-gray-500 mt-1 truncate">
                  <span class="text-gray-400">A:</span> {{ pair.assistant.content.slice(0, 100) }}{{ pair.assistant.content.length > 100 ? '...' : '' }}
                </p>
              </div>
              <!-- Trace 概要 -->
              <div v-if="pair.assistant?.meta?.trace" class="flex-shrink-0 text-right">
                <div class="flex items-center gap-1.5 text-xs">
                  <template v-for="l in pair.assistant.meta.trace.layers" :key="l.layer">
                    <span
                      v-if="l.injected"
                      :title="`${layerLabel(l.layer).name}: ${l.chars} 字`"
                      class="inline-block w-5 h-5 rounded bg-emerald-100 text-emerald-700 text-center leading-5 text-[10px] font-bold"
                    >{{ layerLabel(l.layer).icon }}</span>
                    <span
                      v-else
                      :title="`${layerLabel(l.layer).name}: 未注入`"
                      class="inline-block w-5 h-5 rounded bg-gray-100 text-gray-400 text-center leading-5 text-[10px]"
                    >{{ layerLabel(l.layer).icon }}</span>
                  </template>
                </div>
                <div class="text-[10px] text-gray-400 mt-1">{{ pair.assistant.meta.trace.elapsedMs }}ms · {{ pair.assistant.meta.trace.totalChars }}字</div>
              </div>
              <div v-if="pair.assistant?.meta?.trace" class="flex-shrink-0 text-gray-400 self-center">
                {{ expanded[pair.assistant.id] ? '▲' : '▼' }}
              </div>
            </div>
          </button>

          <!-- 展开详情 -->
          <div v-if="pair.assistant?.meta?.trace && expanded[pair.assistant.id]" class="border-t border-gray-100 p-4 bg-gray-50/40">
            <!-- 元信息 -->
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-4">
              <span>📦 装配器版本：<span class="font-mono">{{ pair.assistant.meta.trace.version }}</span></span>
              <span v-if="pair.assistant.meta.trace.llm">🤖 模型：<span class="font-mono">{{ pair.assistant.meta.trace.llm.model }}</span></span>
              <span v-if="pair.assistant.meta.trace.llm">⚡ 重试 {{ pair.assistant.meta.trace.llm.retries }} 次 / {{ pair.assistant.meta.trace.llm.elapsedMs }}ms</span>
              <span>⏱️ 装配 {{ pair.assistant.meta.trace.elapsedMs }}ms</span>
            </div>

            <!-- 七层注入明细 -->
            <h3 class="text-sm font-semibold text-gray-700 mb-2">🧱 七层 Context 注入</h3>
            <div class="space-y-1.5 mb-4">
              <div
                v-for="l in pair.assistant.meta.trace.layers"
                :key="l.layer"
                class="flex items-center gap-2 text-xs px-2 py-1.5 rounded"
                :class="l.injected ? 'bg-emerald-50 border border-emerald-100' : 'bg-gray-50 border border-gray-100'"
              >
                <span class="w-5 text-center">{{ layerLabel(l.layer).icon }}</span>
                <span class="font-medium" :class="l.injected ? 'text-emerald-700' : 'text-gray-400'">
                  {{ layerLabel(l.layer).name }}
                </span>
                <span class="font-mono" :class="l.injected ? 'text-emerald-600' : 'text-gray-400'">{{ layerChars(l) }}</span>
                <span class="text-gray-400 truncate flex-1" :title="l.source">📍 {{ l.source }}</span>
                <span v-if="l.injected" class="text-emerald-500 text-[10px]">✓</span>
                <span v-else class="text-gray-300 text-[10px]">—</span>
              </div>
            </div>

            <!-- L5 检索明细 -->
            <div v-if="pair.assistant.meta.trace.retrievalStats || pair.assistant.meta.trace.retrievedItems">
              <h3 class="text-sm font-semibold text-gray-700 mb-2">
                🔍 L5 检索记忆
                <span v-if="pair.assistant.meta.trace.retrievalStats" class="text-xs text-gray-400 ml-1">
                  · {{ pair.assistant.meta.trace.retrievalStats.hits }} 命中 / {{ pair.assistant.meta.trace.retrievalStats.durationMs }}ms
                  · 向量{{ pair.assistant.meta.trace.retrievalStats.vectorEnabled ? '✅' : '❌' }}
                </span>
              </h3>
              <div v-if="pair.assistant.meta.trace.retrievedItems && pair.assistant.meta.trace.retrievedItems.length > 0" class="space-y-2">
                <div
                  v-for="(item, idx) in pair.assistant.meta.trace.retrievedItems"
                  :key="item.id"
                  class="p-2 bg-white rounded border border-gray-100 text-xs"
                >
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-[10px] font-bold text-gray-500">#{{ idx + 1 }}</span>
                    <span
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold"
                      :class="{
                        'bg-blue-100 text-blue-700': item.kind === 'fact',
                        'bg-purple-100 text-purple-700': item.kind === 'episode',
                        'bg-pink-100 text-pink-700': item.kind === 'emotion',
                        'bg-amber-100 text-amber-700': item.kind === 'event',
                      }"
                    >{{ item.kind }}</span>
                    <span
                      class="px-1.5 py-0.5 rounded text-[10px]"
                      :class="{
                        'bg-emerald-100 text-emerald-700': item.source === 'vector',
                        'bg-sky-100 text-sky-700': item.source === 'text',
                        'bg-rose-100 text-rose-700 font-bold': item.source === 'both',
                      }"
                    >{{ item.source === 'both' ? '双通道' : item.source === 'vector' ? '向量' : '全文' }}</span>
                    <span class="text-gray-400">imp={{ item.importance.toFixed(2) }}</span>
                    <span class="font-mono ml-auto" :class="scoreColor(item.score)">score={{ item.score.toFixed(6) }}</span>
                  </div>
                  <p class="text-gray-700 leading-relaxed">{{ item.content }}</p>
                </div>
              </div>
              <p v-else class="text-xs text-gray-400 italic">本轮 L5 检索无命中（召回池为空）</p>
            </div>

            <!-- LLM 错误信息 -->
            <div v-if="pair.assistant.meta.error" class="mt-4 p-2 bg-red-50 border border-red-100 rounded text-xs text-red-700">
              ⚠️ LLM 调用错误：{{ JSON.stringify(pair.assistant.meta.error) }}
            </div>

            <!-- 提取元信息 -->
            <div v-if="pair.assistant.meta.extraction" class="mt-4 p-2 bg-blue-50 border border-blue-100 rounded text-xs text-blue-700">
              📝 本轮记忆提取：{{ JSON.stringify(pair.assistant.meta.extraction) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  @apply bg-white rounded-xl shadow-sm border border-gray-100;
}
</style>