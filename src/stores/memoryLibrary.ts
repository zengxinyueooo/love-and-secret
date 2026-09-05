/**
 * 记忆库 store（M7）
 *
 * 与 src/stores/memories.ts 区分：
 *   - memories.ts     旧的"用户手动写回忆"（localStorage 模拟数据）
 *   - memoryLibrary   M3 自动提取的 AI 记忆（调后端 /api/memories）
 *
 * 提供：
 *   - loadAll: 加载全部记忆（可按 conversationId/status/kind 过滤）
 *   - approve / reject / edit: Write Gate 操作
 *   - remove: 物理删除（与 reject 区别：reject 是软删除 + 留审计）
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { backend, type MemoryDTO } from '../utils/backend'

export type MemoryKind = MemoryDTO['kind']
export type MemoryStatus = MemoryDTO['status']

export const useMemoryLibraryStore = defineStore('memoryLibrary', () => {
  const memories = ref<MemoryDTO[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastConversationId = ref<string | null>(null)

  /** 按会话加载记忆；同一会话不会重复请求 */
  async function loadAll(params?: { conversationId?: string; status?: MemoryStatus; kind?: MemoryKind }) {
    loading.value = true
    error.value = null
    try {
      memories.value = await backend.listMemories(params)
      lastConversationId.value = params?.conversationId ?? null
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function approve(id: string) {
    const updated = await backend.updateMemory(id, { action: 'approve' })
    replaceInPlace(updated)
  }

  async function reject(id: string) {
    const updated = await backend.updateMemory(id, { action: 'reject' })
    replaceInPlace(updated)
  }

  async function edit(id: string, content: string) {
    const updated = await backend.updateMemory(id, { action: 'edit', content })
    replaceInPlace(updated)
  }

  async function remove(id: string) {
    await backend.deleteMemory(id)
    memories.value = memories.value.filter((m) => m.id !== id)
  }

  function replaceInPlace(updated: MemoryDTO) {
    const idx = memories.value.findIndex((m) => m.id === updated.id)
    if (idx >= 0) memories.value[idx] = updated
  }

  // ---------------------------------------------------------------------------
  // 派生
  // ---------------------------------------------------------------------------
  const pending = computed(() => memories.value.filter((m) => m.status === 'pending_review'))
  const active = computed(() => memories.value.filter((m) => m.status === 'active'))
  const superseded = computed(() => memories.value.filter((m) => m.status === 'superseded'))
  const rejected = computed(() => memories.value.filter((m) => m.status === 'rejected'))

  /** 按会话分组（用于会话内浏览记忆） */
  const byConversation = computed(() => {
    const map = new Map<string, MemoryDTO[]>()
    for (const m of memories.value) {
      if (!m.conversationId) continue
      const arr = map.get(m.conversationId) ?? []
      arr.push(m)
      map.set(m.conversationId, arr)
    }
    return map
  })

  return {
    memories,
    loading,
    error,
    lastConversationId,
    pending,
    active,
    superseded,
    rejected,
    byConversation,
    loadAll,
    approve,
    reject,
    edit,
    remove,
  }
})