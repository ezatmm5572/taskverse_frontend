<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { apiRequest } from '../services/api.js'
import { renderRich } from '../services/richtext.js'

// Public, read-only page for a task share link: GET /public/task/:token (no sign-in).
const route = useRoute()
const task = ref(null)
const error = ref('')
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await apiRequest(`/public/task/${encodeURIComponent(route.params.token)}`)
    task.value = res?.data?.task || res?.data || null
  } catch (e) {
    error.value = e.status === 404 ? 'This link is invalid or has been revoked.' : e.message
  } finally { loading.value = false }
})

const day = d => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const STATUS = { toDo: 'To do', inProgress: 'In progress', completed: 'Completed', failed: 'Blocked' }
const status = computed(() => STATUS[task.value?.status] || task.value?.status || '')
const subtasks = computed(() => task.value?.subtasks || [])
</script>

<template>
  <div class="app-shell">
    <div class="ambient-bg" aria-hidden="true"><div class="aurora-orb orb-violet"></div><div class="aurora-orb orb-cyan"></div></div>
    <main class="auth-screen">
      <section class="auth-card glass-panel shared-card">
        <RouterLink to="/" class="back-home">taskverse.</RouterLink>
        <p v-if="loading" class="muted">Loading…</p>
        <p v-else-if="error" class="auth-error">{{ error }}</p>
        <template v-else-if="task">
          <div class="auth-kicker">Shared task · read-only</div>
          <h1 dir="auto">{{ task.title }}</h1>
          <div class="kv-grid">
            <span>Status</span><strong>{{ status }}</strong>
            <span>Start</span><strong>{{ day(task.startDate) }}</strong>
            <span>Due</span><strong>{{ day(task.endDate) }}</strong>
            <template v-if="task.priority"><span>Priority</span><strong>{{ task.priority }}</strong></template>
          </div>
          <div v-if="task.description" class="rt-view" dir="auto" v-html="renderRich(task.description)"></div>
          <div v-if="subtasks.length" class="td-section">
            <div class="eyebrow">Checklist</div>
            <div v-for="s in subtasks" :key="s._id || s.text" class="att-row"><input type="checkbox" :checked="s.done" disabled /> <span class="td-grow" dir="auto">{{ s.text }}</span></div>
          </div>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
.shared-card { width: min(100%, 640px); display: flex; flex-direction: column; gap: 14px; }
</style>
