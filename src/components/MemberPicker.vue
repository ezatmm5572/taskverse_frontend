<script setup>
import { computed, ref } from 'vue'
import { Check, Search } from 'lucide-vue-next'

// Reusable multi-select list with search + "select all" (applies to the filtered results).
const props = defineProps({
  items: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
  exclude: { type: Array, default: () => [] },
  emptyText: { type: String, default: 'No one available.' },
  maxHeight: { type: String, default: '240px' }
})
const emit = defineEmits(['update:modelValue'])

const query = ref('')
const nameOf = m => `${m?.fname || ''} ${m?.lname || ''}`.trim() || m?.email || 'Member'
const initialsOf = m => nameOf(m).split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase()

const available = computed(() => {
  const skip = new Set(props.exclude.map(String))
  return props.items.filter(m => !skip.has(String(m._id)))
})
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? available.value.filter(m => `${nameOf(m)} ${m.email || ''}`.toLowerCase().includes(q)) : available.value
})
const selected = computed(() => new Set(props.modelValue.map(String)))
const allSelected = computed(() => filtered.value.length > 0 && filtered.value.every(m => selected.value.has(String(m._id))))

function toggle(id) {
  const next = new Set(selected.value)
  next.has(String(id)) ? next.delete(String(id)) : next.add(String(id))
  emit('update:modelValue', [...next])
}
function toggleAll() {
  const next = new Set(selected.value)
  filtered.value.forEach(m => allSelected.value ? next.delete(String(m._id)) : next.add(String(m._id)))
  emit('update:modelValue', [...next])
}
</script>

<template>
  <div class="picker">
    <div class="picker-bar">
      <label class="picker-search">
        <Search :size="14" />
        <input v-model="query" type="text" placeholder="Search by name or email…" />
      </label>
      <button type="button" class="secondary-btn tiny-btn picker-all" :disabled="!filtered.length" @click="toggleAll">
        {{ allSelected ? 'Clear all' : 'Select all' }}
      </button>
    </div>
    <div class="picker-count">{{ modelValue.length }} selected · {{ available.length }} available</div>
    <div class="picker-list" :style="{ maxHeight }">
      <button
        v-for="m in filtered"
        :key="m._id"
        type="button"
        class="picker-row"
        :class="{ on: selected.has(String(m._id)) }"
        @click="toggle(m._id)"
      >
        <span class="picker-box"><Check v-if="selected.has(String(m._id))" :size="12" /></span>
        <span class="mini-avatar">{{ initialsOf(m) }}</span>
        <span class="picker-meta">
          <strong>{{ nameOf(m) }}</strong>
          <small>{{ m.email }}</small>
        </span>
      </button>
      <div v-if="!filtered.length" class="picker-empty">{{ available.length ? 'No matches.' : emptyText }}</div>
    </div>
  </div>
</template>

<style scoped>
.picker { display: flex; flex-direction: column; gap: 8px; }
.picker-bar { display: flex; gap: 8px; align-items: center; }
.picker-search {
  flex-direction: row !important; font-weight: 400 !important;
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px;
  padding: 0 12px; border: 1px solid var(--glass-border); border-radius: 999px; color: var(--text-muted);
}
.picker-search input { flex: 1; min-width: 0; border: 0; background: transparent; outline: 0; padding: 10px 0; color: inherit; font: inherit; font-size: 13px; }
.picker-all { width: auto; white-space: nowrap; padding: 8px 12px; font-size: 12px; }
.picker-count { font-size: 11.5px; color: var(--text-muted); }
.picker-list {
  display: flex; flex-direction: column; gap: 4px; overflow-y: auto;
  padding: 4px; border: 1px solid var(--glass-border); border-radius: 22px;
}
.picker-row {
  display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  padding: 8px 10px; border-radius: 16px; border: 1px solid transparent;
  background: transparent; color: inherit; font: inherit; cursor: pointer; transition: background .15s;
}
.picker-row:hover { background: rgba(139, 92, 246, 0.1); }
.picker-row.on { background: rgba(139, 92, 246, 0.18); border-color: rgba(139, 92, 246, 0.4); }
.picker-box {
  width: 18px; height: 18px; flex: none; display: grid; place-items: center;
  border-radius: 50%; border: 1.5px solid var(--glass-border); color: #fff;
}
.picker-row.on .picker-box { background: var(--primary-gradient, #8b5cf6); border-color: transparent; }
.picker-meta { display: flex; flex-direction: column; min-width: 0; }
.picker-meta strong { font-size: 13px; }
.picker-meta small { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.picker-empty { padding: 18px; text-align: center; font-size: 12.5px; color: var(--text-muted); }
</style>
