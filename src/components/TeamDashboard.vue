<script setup>
import { computed } from 'vue'
import { extras, fmtMinutes } from '../services/extras.js'
import TimeCard from './TimeCard.vue'

const props = defineProps({
  team: { type: Object, required: true },
  tasks: { type: Array, required: true }, // already scoped to the team
  members: { type: Array, required: true }, // team members
  statusOf: { type: Function, required: true },
  memberTasks: { type: Function, required: true },
  completedAtOf: { type: Function, required: true },
  getId: { type: Function, required: true }
})
const emit = defineEmits(['open'])

const DAY = 86400000
const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime() }
const nameOf = m => `${m?.fname || ''} ${m?.lname || ''}`.trim() || m?.email || 'Member'
const todayTs = dayStart(Date.now())
const isDone = t => props.statusOf(t) === 'Completed'
const isLate = t => !isDone(t) && t.endDate && dayStart(t.endDate) < todayTs

const kpis = computed(() => {
  const total = props.tasks.length
  const done = props.tasks.filter(isDone).length
  const late = props.tasks.filter(isLate).length
  const logged = props.tasks.reduce((n, t) => n + extras.logged(t._id), 0)
  const est = props.tasks.reduce((n, t) => n + extras.get(t._id).estimateMin, 0)
  return { total, done, open: total - done, late, pct: total ? Math.round(done / total * 100) : 0, logged, est }
})

// --- Burn-down: open tasks remaining per day vs. the ideal straight line ---
const W = 640, H = 230, PAD = { l: 38, r: 16, t: 14, b: 30 }
const burn = computed(() => {
  const list = props.tasks
  if (!list.length) return null
  const starts = list.map(t => dayStart(t.startDate || t.endDate || Date.now()))
  const ends = list.map(t => dayStart(t.endDate || t.startDate || Date.now()))
  let from = Math.min(...starts)
  let to = Math.max(...ends, todayTs)
  if (to - from > 90 * DAY) from = to - 90 * DAY
  if (to === from) to = from + DAY
  const days = Math.round((to - from) / DAY)
  const total = list.length
  const done = list.filter(isDone).map(t => ({ at: dayStart(props.completedAtOf(t) || Date.now()) }))
  const lastActual = Math.min(days, Math.round((todayTs - from) / DAY))
  const actual = []
  for (let i = 0; i <= lastActual; i++) {
    const ts = from + i * DAY
    actual.push(total - done.filter(x => x.at <= ts).length)
  }
  const ideal = Array.from({ length: days + 1 }, (_, i) => total * (1 - i / days))
  const x = i => PAD.l + (i / days) * (W - PAD.l - PAD.r)
  const y = v => PAD.t + (1 - v / total) * (H - PAD.t - PAD.b)
  const pts = arr => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const label = i => new Date(from + i * DAY).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return {
    total, days, lastActual, actualPts: pts(actual), idealPts: pts(ideal),
    todayX: x(Math.max(0, Math.min(days, lastActual))),
    ticks: [0, Math.round(days / 2), days].map(i => ({ x: x(i), text: label(i) })),
    yTicks: [0, Math.ceil(total / 2), total].map(v => ({ y: y(v), v })),
    behind: actual[actual.length - 1] > ideal[Math.min(lastActual, days)] + 0.5
  }
})

// --- Workload per member ---
const workload = computed(() => props.members.map(m => {
  const list = props.memberTasks(m).filter(x => props.tasks.some(t => String(t._id) === String(x.task._id)))
  const done = list.filter(x => props.statusOf({ status: x.status }) === 'Completed').length
  const late = list.filter(x => !(props.statusOf({ status: x.status }) === 'Completed') && x.task.endDate && dayStart(x.task.endDate) < todayTs).length
  let minutes = 0
  for (const t of props.tasks) for (const e of extras.get(t._id).timeEntries) if (String(e.authorId) === String(m._id)) minutes += e.minutes
  return { id: m._id, name: nameOf(m), total: list.length, open: list.length - done, done, late, minutes }
}).sort((a, b) => b.open - a.open))
const maxOpen = computed(() => Math.max(1, ...workload.value.map(w => w.total)))
</script>

<template>
  <section class="td-dash">
    <div class="kpi-row">
      <article class="panel glass-panel kpi"><small>Tasks</small><strong>{{ kpis.total }}</strong><span>{{ kpis.open }} open</span></article>
      <article class="panel glass-panel kpi"><small>Completed</small><strong>{{ kpis.pct }}%</strong><span>{{ kpis.done }} of {{ kpis.total }}</span></article>
      <article class="panel glass-panel kpi"><small>Overdue</small><strong :class="{ bad: kpis.late }">{{ kpis.late }}</strong><span>{{ kpis.late ? 'needs attention' : 'on track' }}</span></article>
      <article class="panel glass-panel kpi"><small>Time</small><strong>{{ fmtMinutes(kpis.logged) }}</strong><span>{{ kpis.est ? 'of ' + fmtMinutes(kpis.est) : 'no estimates' }}</span></article>
    </div>

    <div class="dash-grid">
      <article class="panel glass-panel dcard dwide">
        <h3>Burn-down <span v-if="burn" class="state" :class="burn.behind ? 'late' : 'ok'">{{ burn.behind ? 'Behind plan' : 'On / ahead of plan' }}</span></h3>
        <svg v-if="burn" :viewBox="`0 0 ${W} ${H}`" class="burn" role="img" aria-label="Burn-down chart">
          <g class="grid">
            <line v-for="t in burn.yTicks" :key="t.v" :x1="PAD.l" :x2="W - PAD.r" :y1="t.y" :y2="t.y" />
            <text v-for="t in burn.yTicks" :key="'l' + t.v" :x="PAD.l - 8" :y="t.y + 4" text-anchor="end">{{ t.v }}</text>
            <text v-for="t in burn.ticks" :key="t.text + t.x" :x="t.x" :y="H - 8" text-anchor="middle">{{ t.text }}</text>
          </g>
          <line class="today" :x1="burn.todayX" :x2="burn.todayX" :y1="PAD.t" :y2="H - PAD.b" />
          <polyline class="ideal" :points="burn.idealPts" />
          <polyline class="actual" :points="burn.actualPts" />
        </svg>
        <div v-if="burn" class="legend-row"><span><i class="ideal-i"></i> Ideal</span><span><i class="actual-i"></i> Remaining</span></div>
        <span v-else class="muted">This team has no tasks yet.</span>
      </article>

      <article class="panel glass-panel dcard">
        <h3>Workload</h3>
        <div class="wl">
          <div v-for="w in workload" :key="w.id" class="wl-row">
            <div class="wl-head"><span>{{ w.name }}</span><small>{{ w.open }} open · {{ w.done }} done<template v-if="w.late"> · <em>{{ w.late }} late</em></template><template v-if="w.minutes"> · {{ fmtMinutes(w.minutes) }}</template></small></div>
            <div class="wl-bar"><div class="wl-done" :style="{ width: w.done / maxOpen * 100 + '%' }"></div><div class="wl-open" :style="{ width: w.open / maxOpen * 100 + '%' }"></div></div>
          </div>
          <span v-if="!workload.length" class="muted">No members.</span>
        </div>
      </article>

      <TimeCard :tasks="tasks" @open="emit('open', $event)" />
    </div>
  </section>
</template>

<style scoped>
.td-dash { display: flex; flex-direction: column; gap: 16px; margin-bottom: 18px; }
.kpi-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.kpi { padding: 16px 20px; display: flex; flex-direction: column; gap: 2px; }
.kpi small { color: var(--text-muted); font-size: 12px; }
.kpi strong { font-family: 'Space Grotesk', sans-serif; font-size: 28px; }
.kpi span { color: var(--text-muted); font-size: 12px; }
.bad { color: var(--accent-rose); }
.dash-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.dwide { grid-column: 1 / -1; }
.dcard { padding: 20px 22px; display: flex; flex-direction: column; gap: 12px; }
.dcard h3 { margin: 0; display: flex; align-items: center; gap: 10px; font-family: 'Space Grotesk', sans-serif; font-size: 15px; }
.state { padding: 2px 10px; border-radius: 99px; font-size: 11px; font-family: inherit; }
.state.ok { background: rgba(52, 211, 153, .16); color: var(--accent-emerald); }
.state.late { background: rgba(248, 113, 113, .16); color: var(--accent-rose); }
.burn { width: 100%; height: auto; max-height: 300px; }
.grid line { stroke: var(--glass-border); stroke-dasharray: 3 4; }
.grid text { fill: var(--text-muted); font-size: 10px; }
.today { stroke: rgba(139, 92, 246, .6); stroke-dasharray: 2 3; }
.ideal { fill: none; stroke: var(--text-dim, #7c82a0); stroke-width: 2; stroke-dasharray: 6 5; }
.actual { fill: none; stroke: var(--accent-cyan); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
.legend-row { display: flex; gap: 18px; font-size: 12px; color: var(--text-muted); }
.legend-row i { display: inline-block; width: 18px; height: 0; margin-inline-end: 6px; vertical-align: middle; border-top: 3px solid; }
.ideal-i { border-color: var(--text-dim, #7c82a0); border-top-style: dashed !important; }
.actual-i { border-color: var(--accent-cyan); }
.wl { display: flex; flex-direction: column; gap: 12px; }
.wl-head { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; margin-bottom: 5px; }
.wl-head small { color: var(--text-muted); text-align: end; }
.wl-head em { color: var(--accent-rose); font-style: normal; }
.wl-bar { display: flex; height: 9px; border-radius: 99px; background: var(--glass-border); overflow: hidden; }
.wl-done { background: var(--accent-emerald); }
.wl-open { background: var(--accent-cyan); }
.muted { color: var(--text-muted); font-size: 12.5px; }
@media (max-width: 900px) { .kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dash-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
