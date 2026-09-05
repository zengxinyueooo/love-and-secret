<template>
  <div class="min-h-[calc(100vh-64px)] bg-bg-main p-6">
    <div class="container mx-auto max-w-6xl">
      <!-- 头部 -->
      <div class="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 class="text-3xl font-bold text-gray-800">🧠 AI 记忆库</h1>
          <p class="text-sm text-gray-500 mt-1">
            M3 自动提取 · 共 {{ library.memories.length }} 条 · 待审 {{ library.pending.length }} 条
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <select v-model="conversationFilter" class="input-field max-w-xs">
            <option value="">全会话</option>
            <option v-for="c in conversations" :key="c.id" :value="c.id">
              {{ c.title }}
            </option>
          </select>
          <button @click="reload" :disabled="library.loading" class="btn-secondary">
            {{ library.loading ? '加载中...' : '刷新' }}
          </button>
          <button @click="exportConversation('json')" :disabled="!conversationFilter" class="btn-secondary">
            导出 JSON
          </button>
          <button @click="exportConversation('markdown')" :disabled="!conversationFilter" class="btn-secondary">
            导出 Markdown
          </button>
        </div>
      </div>

      <!-- 错误提示 -->
      <div v-if="library.error" class="card p-4 mb-4 bg-red-50 border-red-200">
        <p class="text-red-700 text-sm">{{ library.error }}</p>
      </div>

      <!-- Tab 切换 -->
      <div class="flex flex-wrap gap-2 mb-6 border-b border-gray-200">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          @click="activeTab = tab.key"
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          :class="
            activeTab === tab.key
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          "
        >
          {{ tab.label }}
          <span v-if="tab.count > 0" class="ml-1 px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700 text-xs">
            {{ tab.count }}
          </span>
        </button>
      </div>

      <!-- 筛选栏 -->
      <div class="flex flex-wrap gap-3 mb-6 items-center">
        <label class="text-sm text-gray-600">类型：</label>
        <select v-model="kindFilter" class="input-field max-w-xs text-sm">
          <option value="">全部</option>
          <option value="fact">📌 事实</option>
          <option value="episode">🎬 情景</option>
          <option value="emotion">💗 情感</option>
          <option value="event">🎉 事件</option>
        </select>
        <label class="text-sm text-gray-600">排序：</label>
        <select v-model="sortBy" class="input-field max-w-xs text-sm">
          <option value="createdAt">按创建时间</option>
          <option value="importance">按重要度</option>
          <option value="emotionalIntensity">按情感强度</option>
        </select>
        <span class="text-sm text-gray-500 ml-auto">
          当前显示 {{ filteredList.length }} 条
        </span>
      </div>

      <!-- 记忆列表 -->
      <div v-if="filteredList.length > 0" class="space-y-3">
        <article
          v-for="m in filteredList"
          :key="m.id"
          class="card p-5 hover:shadow-md transition-shadow"
          :class="statusBorderClass(m.status)"
        >
          <div class="flex justify-between items-start gap-3 mb-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xl">{{ kindIcon(m.kind) }}</span>
              <span class="font-medium text-gray-800">{{ kindLabel(m.kind) }}</span>
              <span class="px-2 py-0.5 rounded text-xs" :class="statusBadgeClass(m.status)">
                {{ statusLabel(m.status) }}
              </span>
              <span v-if="m.gate === 'review'" class="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">
                待审
              </span>
              <span v-if="m.emotionalDimension" class="px-2 py-0.5 rounded text-xs bg-pink-100 text-pink-700">
                {{ dimensionLabel(m.emotionalDimension) }}
              </span>
            </div>
            <div class="text-xs text-gray-400 whitespace-nowrap">
              {{ formatDate(m.createdAt) }}
            </div>
          </div>

          <p class="text-gray-700 leading-relaxed mb-3 whitespace-pre-wrap">
            {{ m.content }}
          </p>

          <div v-if="m.summary" class="text-sm text-gray-500 italic mb-3">
            摘要：{{ m.summary }}
          </div>

          <!-- 元信息条 -->
          <div class="flex flex-wrap gap-3 text-xs text-gray-500 mb-3 pt-3 border-t border-gray-100">
            <span>重要度 <strong class="text-gray-700">{{ m.importance.toFixed(2) }}</strong></span>
            <span>置信度 <strong class="text-gray-700">{{ m.confidence.toFixed(2) }}</strong></span>
            <span v-if="m.emotionalIntensity > 0">
              情感强度 <strong class="text-gray-700">{{ m.emotionalIntensity.toFixed(2) }}</strong>
            </span>
            <span v-if="m.valence !== null && m.valence !== undefined">
              效价 <strong class="text-gray-700">{{ m.valence.toFixed(2) }}</strong>
            </span>
            <span v-if="m.accessCount > 0">被引用 {{ m.accessCount }} 次</span>
            <span v-if="m.sourceMessageIds.length > 0">
              原文 {{ m.sourceMessageIds.length }} 段
            </span>
          </div>

          <!-- 操作 -->
          <div class="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
            <button
              v-if="m.status === 'pending_review'"
              @click="handleApprove(m.id)"
              class="btn-primary text-xs"
            >
              ✓ 批准
            </button>
            <button
              v-if="m.status === 'pending_review'"
              @click="handleReject(m.id)"
              class="btn-secondary text-xs"
            >
              ✗ 拒绝
            </button>
            <button @click="openEdit(m)" class="btn-secondary text-xs">编辑</button>
            <button @click="handleDelete(m.id)" class="text-xs text-gray-500 hover:text-red-500 ml-auto">
              🗑 删除
            </button>
          </div>
        </article>
      </div>

      <!-- 空状态 -->
      <div v-else class="text-center py-20">
        <div class="text-6xl mb-4">🧠</div>
        <h2 class="text-2xl font-bold text-gray-700 mb-2">
          {{ activeTab === 'pending' ? '没有待审记忆' : '此视图下暂无记忆' }}
        </h2>
        <p class="text-gray-500">
          {{ conversationFilter ? '试试切换会话或全选' : '开始和黎深聊天后会自动提取' }}
        </p>
      </div>

      <!-- 编辑弹窗 -->
      <div
        v-if="editingMemory"
        class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
        @click.self="editingMemory = null"
      >
        <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6">
          <h3 class="text-xl font-bold mb-4">编辑记忆</h3>
          <textarea
            v-model="editingContent"
            rows="6"
            class="input-field resize-none w-full font-mono text-sm"
          />
          <div class="mt-4 flex justify-end gap-2">
            <button @click="editingMemory = null" class="btn-secondary">取消</button>
            <button @click="handleSaveEdit" class="btn-primary">保存</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useMemoryLibraryStore, type MemoryKind, type MemoryStatus } from '../stores/memoryLibrary'
import { backend, type ConversationDTO } from '../utils/backend'
import { formatDate } from '../utils/date'

const library = useMemoryLibraryStore()

const conversationFilter = ref('')
const kindFilter = ref<'' | MemoryKind>('')
const sortBy = ref<'createdAt' | 'importance' | 'emotionalIntensity'>('createdAt')
const activeTab = ref<'pending' | 'active' | 'superseded' | 'rejected'>('pending')

const conversations = ref<ConversationDTO[]>([])
const editingMemory = ref<{ id: string } | null>(null)
const editingContent = ref('')

onMounted(async () => {
  conversations.value = await backend.listConversations()
  await reload()
})

async function reload() {
  await library.loadAll({
    conversationId: conversationFilter.value || undefined,
  })
}

const tabs = computed(() => [
  { key: 'pending' as const, label: '待审', count: library.pending.length },
  { key: 'active' as const, label: '已激活', count: library.active.length },
  { key: 'superseded' as const, label: '已取代', count: library.superseded.length },
  { key: 'rejected' as const, label: '已拒绝', count: library.rejected.length },
])

const filteredList = computed(() => {
  let list = library.memories
  if (activeTab.value === 'pending') list = library.pending
  else if (activeTab.value === 'active') list = library.active
  else if (activeTab.value === 'superseded') list = library.superseded
  else if (activeTab.value === 'rejected') list = library.rejected

  if (kindFilter.value) list = list.filter((m) => m.kind === kindFilter.value)

  const sorted = [...list]
  if (sortBy.value === 'createdAt') {
    sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } else if (sortBy.value === 'importance') {
    sorted.sort((a, b) => b.importance - a.importance)
  } else if (sortBy.value === 'emotionalIntensity') {
    sorted.sort((a, b) => b.emotionalIntensity - a.emotionalIntensity)
  }
  return sorted
})

function kindIcon(kind: MemoryKind): string {
  return { fact: '📌', episode: '🎬', emotion: '💗', event: '🎉' }[kind]
}
function kindLabel(kind: MemoryKind): string {
  return { fact: '事实', episode: '情景', emotion: '情感', event: '事件' }[kind]
}
function statusLabel(status: MemoryStatus): string {
  return { active: '已激活', pending_review: '待审', rejected: '已拒绝', superseded: '已取代' }[status]
}
function statusBadgeClass(status: MemoryStatus): string {
  return {
    active: 'bg-green-100 text-green-700',
    pending_review: 'bg-yellow-100 text-yellow-700',
    rejected: 'bg-gray-200 text-gray-600',
    superseded: 'bg-orange-100 text-orange-700',
  }[status]
}
function statusBorderClass(status: MemoryStatus): string {
  return {
    active: 'border-l-4 border-green-400',
    pending_review: 'border-l-4 border-yellow-400',
    rejected: 'border-l-4 border-gray-300',
    superseded: 'border-l-4 border-orange-300 opacity-70',
  }[status]
}
function dimensionLabel(d: string): string {
  return { intimacy: '亲密', trust: '信任', conflict: '冲突', arousal: '唤醒' }[d] ?? d
}

async function handleApprove(id: string) {
  try {
    await library.approve(id)
  } catch (e) {
    alert('批准失败：' + (e instanceof Error ? e.message : String(e)))
  }
}
async function handleReject(id: string) {
  if (!confirm('拒绝后这条记忆将不再被检索，确认？')) return
  try {
    await library.reject(id)
  } catch (e) {
    alert('拒绝失败：' + (e instanceof Error ? e.message : String(e)))
  }
}
async function handleDelete(id: string) {
  if (!confirm('永久删除这条记忆？')) return
  try {
    await library.remove(id)
  } catch (e) {
    alert('删除失败：' + (e instanceof Error ? e.message : String(e)))
  }
}
function openEdit(m: { id: string; content: string }) {
  editingMemory.value = { id: m.id }
  editingContent.value = m.content
}
async function handleSaveEdit() {
  if (!editingMemory.value) return
  try {
    await library.edit(editingMemory.value.id, editingContent.value)
    editingMemory.value = null
  } catch (e) {
    alert('保存失败：' + (e instanceof Error ? e.message : String(e)))
  }
}

async function exportConversation(format: 'json' | 'markdown') {
  if (!conversationFilter.value) {
    alert('请先选择要导出的会话')
    return
  }
  try {
    const { filename, blob } = await backend.exportConversation(conversationFilter.value, format)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) {
    alert('导出失败：' + (e instanceof Error ? e.message : String(e)))
  }
}
</script>