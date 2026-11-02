<script setup>
import { computed } from 'vue'
import { Clock } from 'lucide-vue-next'
import { extras, fmtMinutes } from '../services/extras.js'

// Time-tracking report for a set of tasks: totals vs estimates, per member and per task.
const props = defineProps({
  tasks: { type: Array, required: true }
})
const emit = defineEmits(['open'])

const rows = computed(() => props.tasks.map(task => {
  const e = extras.get(task._id)
  return { task, est: e.estimateMin, logged: extras.logged(task._id), running: !!e.timer }
}).filter(r => r.est || r.logged || r.running))

const totalEst = computed(() => rows.value.reduce((n, r) => n + r.est, 0))
const totalLogged = computed(() => rows.value.reduce((n, r) => n + r.logged, 0))
const pct = computed(() => totalEst.value ? Math.min(100, Math.round(totalLogged.value / totalEst.value * 100)) : 0)

const byMember = computed(() => {
  const ids = new Set(props.tasks.map(t => String(t._id)))
  const map = new Map()
  for (const [taskId, e] of Object.entries(extras.all())) {
    if (!ids.has(String(taskId))) continue
    for (const x of e.timeEntries || []) {
      const cur = map.get(x.authorId) || { name: x.authorName, minutes: 0 }
      cur.minutes += x.minutes
      map.set(x.authorId, cur)
    }
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 6)
})
const top = computed(() => [...rows.value].sort((a, b) => b.logged - a.logged).slice(0, 5))
</script>

<template>
  <article class="panel glass-panel tc">
    <h3><Clock :size="15" /> Time tracked</h3>
    <div class="tc-kpis">
      <div><strong>{{ fmtMinutes(totalLogged) }}</strong><small>Logged</small></div>
      <div><strong>{{ fmtMinutes(totalEst) }}</strong><small>Estimated</small></div>
      <div><strong :class="{ over: totalEst && totalLogged > totalEst }">{{ totalEst ? pct + '%' : '—' }}</strong><small>Of estimate</small></div>
    </div>
    <div v-if="totalEst" class="bar-track"><div class="bar-fill" :class="{ rose: totalLogged > totalEst }" :style="{ width: pct + '%' }"></div></div>

    <div v-if="byMember.length" class="tc-block">
      <div class="eyebrow">BY MEMBER</div>
      <div v-for="m in byMember" :key="m.name" class="tc-row"><span>{{ m.name }}</span><strong>{{ fmtMinutes(m.minutes) }}</strong></div>
    </div>
    <div v-if="top.length" class="tc-block">
      <div class="eyebrow">TOP TASKS</div>
      <button v-for="r in top" :key="r.task._id" class="tc-row tc-btn" @click="emit('open', r.task)">
        <span class="tc-name" dir="auto">{{ r.task.title }}</span>
        <small :class="{ over: r.est && r.logged > r.est }">{{ fmtMinutes(r.logged) }}<template v-if="r.est"> / {{ fmtMinutes(r.est) }}</template></small>
      </button>
    </div>
    <span v-if="!rows.length" class="tc-empty">No time logged yet. Open a task and start the timer or add an estimate.</span>
  </article>
</template>

<style scoped>
.tc { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
.tc h3 { margin: 0; display: flex; align-items: center; gap: 8px; font-family: 'Space Grotesk', sans-serif; font-size: 15px; }
.tc-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.tc-kpis div { display: flex; flex-direction: column; padding: 10px 14px; border: 1px solid var(--glass-border); border-radius: 18px; }
.tc-kpis strong { font-size: 18px; }
.tc-kpis small { color: var(--text-muted); font-size: 11px; }
.over { color: var(--accent-rose); }
.bar-fill.rose { background: var(--accent-rose); }
.tc-block { display: flex; flex-direction: column; gap: 6px; }
.tc-row { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
.tc-btn { padding: 8px 12px; border: 1px solid var(--glass-border); border-radius: 16px; background: transparent; color: inherit; font: inherit; cursor: pointer; text-align: start; }
.tc-btn:hover { background: rgba(139, 92, 246, .1); }
.tc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.tc-empty { color: var(--text-muted); font-size: 12.5px; }
</style>
