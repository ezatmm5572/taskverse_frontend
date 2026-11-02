<script setup>
import { computed } from 'vue'
import { t } from '../services/i18n.js'

const props = defineProps({
  tasks: { type: Array, required: true },
  teams: { type: Array, required: true },
  members: { type: Array, required: true },
  statusOf: { type: Function, required: true },
  memberTasks: { type: Function, required: true },
  activity: { type: Array, default: () => [] },
  getId: { type: Function, required: true }
})
const emit = defineEmits(['open'])

const nameOf = m => `${m?.fname || ''} ${m?.lname || ''}`.trim() || m?.email || 'Member'
const startOfToday = () => new Date(new Date().toDateString())
const isLate = task => props.statusOf(task) !== 'Completed' && task.endDate && new Date(task.endDate) < startOfToday()
const daysLate = task => Math.max(1, Math.round((startOfToday() - new Date(task.endDate)) / 86400000))
const when = d => new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const STATUSES = [
  { key: 'Completed', color: 'var(--accent-emerald)' },
  { key: 'In progress', color: 'var(--accent-cyan)' },
  { key: 'To do', color: 'var(--text-dim, #7c82a0)' },
  { key: 'Blocked', color: 'var(--accent-rose)' }
]
const breakdown = computed(() => {
  const total = props.tasks.length || 1
  let offset = 0
  return STATUSES.map(s => {
    const count = props.tasks.filter(task => props.statusOf(task) === s.key).length
    const pct = (count / total) * 100
    const seg = { ...s, count, pct, dash: `${pct} ${100 - pct}`, offset: -offset }
    offset += pct
    return seg
  })
})

const teamStats = computed(() => props.teams.map(team => {
  const list = props.tasks.filter(task => String(props.getId(task.team)) === String(team._id))
  const done = list.filter(task => props.statusOf(task) === 'Completed').length
  return { id: team._id, name: team.name, total: list.length, done, late: list.filter(isLate).length, pct: list.length ? Math.round((done / list.length) * 100) : 0 }
}))

const memberStats = computed(() => props.members.map(m => {
  const list = props.memberTasks(m)
  const done = list.filter(x => props.statusOf({ status: x.status }) === 'Completed').length
  const late = list.filter(x => isLate({ ...x.task, myAssignment: null, status: x.status })).length
  return { id: m._id, name: nameOf(m), total: list.length, done, late, pct: list.length ? Math.round((done / list.length) * 100) : 0 }
}).filter(m => m.total).sort((a, b) => b.total - a.total).slice(0, 8))

const overdueTasks = computed(() => props.tasks.filter(isLate).sort((a, b) => daysLate(b) - daysLate(a)).slice(0, 5))
const lateByMember = computed(() => [...memberStats.value].filter(m => m.late).sort((a, b) => b.late - a.late).slice(0, 3))
</script>

<template>
  <section class="ins-grid">
    <article class="panel glass-panel ins-card">
      <h3>{{ t('Status breakdown') }}</h3>
      <div class="donut-row">
        <svg viewBox="0 0 42 42" class="donut" role="img" aria-label="Status breakdown">
          <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--glass-border)" stroke-width="5" />
          <circle v-for="s in breakdown" :key="s.key" cx="21" cy="21" r="15.915" fill="none" :stroke="s.color" stroke-width="5"
            :stroke-dasharray="s.dash" :stroke-dashoffset="s.offset + 25" />
          <text x="21" y="22.5" text-anchor="middle" class="donut-n">{{ tasks.length }}</text>
        </svg>
        <ul class="legend">
          <li v-for="s in breakdown" :key="s.key"><i :style="{ background: s.color }"></i>{{ t(s.key) }} <b>{{ s.count }}</b></li>
        </ul>
      </div>
    </article>

    <article class="panel glass-panel ins-card">
      <h3>{{ t('Completion by team') }}</h3>
      <div class="bars">
        <div v-for="x in teamStats" :key="x.id" class="bar-row">
          <div class="bar-label"><span dir="auto">{{ x.name }}</span><small>{{ x.done }}/{{ x.total }} · {{ x.pct }}%</small></div>
          <div class="bar-track"><div class="bar-fill" :style="{ width: x.pct + '%' }"></div></div>
        </div>
        <span v-if="!teamStats.length" class="muted">—</span>
      </div>
    </article>

    <article class="panel glass-panel ins-card">
      <h3>{{ t('Member workload') }}</h3>
      <div class="bars">
        <div v-for="x in memberStats" :key="x.id" class="bar-row">
          <div class="bar-label"><span>{{ x.name }}</span><small>{{ x.done }}/{{ x.total }}<template v-if="x.late"> · <em class="late">{{ x.late }} late</em></template></small></div>
          <div class="bar-track"><div class="bar-fill emerald" :style="{ width: x.pct + '%' }"></div></div>
        </div>
        <span v-if="!memberStats.length" class="muted">—</span>
      </div>
    </article>

    <article class="panel glass-panel ins-card">
      <h3>{{ t('Most overdue') }}</h3>
      <div class="ov-list">
        <button v-for="task in overdueTasks" :key="task._id" class="ov-row" @click="emit('open', task)">
          <span class="td-grow" dir="auto">{{ task.title }}</span>
          <span class="late-pill">{{ daysLate(task) }}d</span>
        </button>
        <span v-if="!overdueTasks.length" class="muted">{{ t('Nothing overdue 🎉') }}</span>
      </div>
      <div v-if="lateByMember.length" class="late-members">
        <span v-for="m in lateByMember" :key="m.id" class="role-badge">{{ m.name }} · {{ m.late }}</span>
      </div>
    </article>

    <article class="panel glass-panel ins-card ins-wide">
      <h3>{{ t('Recent activity') }}</h3>
      <div class="act-list">
        <div v-for="a in activity.slice(0, 8)" :key="a.id" class="act-row">
          <span class="act-dot"></span>
          <span class="td-grow"><strong>{{ a.actorName }}</strong> <span dir="auto">{{ a.text }}</span></span>
          <small>{{ when(a.at) }}</small>
        </div>
        <span v-if="!activity.length" class="muted">{{ t('No activity yet.') }}</span>
      </div>
    </article>
  </section>
</template>

<style scoped>
.ins-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 18px; }
.ins-card { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
.ins-wide { grid-column: 1 / -1; }
.ins-card h3 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 15px; }
.donut-row { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
.donut { width: 130px; height: 130px; transform: rotate(0deg); }
.donut circle { transition: stroke-dasharray .4s; }
.donut-n { font-size: 8px; font-weight: 700; fill: currentColor; }
.legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: 13px; }
.legend li { display: flex; align-items: center; gap: 8px; }
.legend i { width: 10px; height: 10px; border-radius: 50%; }
.legend b { margin-inline-start: auto; padding-inline-start: 14px; }
.bars { display: flex; flex-direction: column; gap: 12px; }
.bar-label { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; margin-bottom: 5px; }
.bar-label small { color: var(--text-muted); white-space: nowrap; }
.bar-track { height: 9px; border-radius: 99px; background: var(--glass-border); overflow: hidden; }
.bar-fill { height: 100%; border-radius: 99px; background: var(--primary-gradient, #8b5cf6); transition: width .4s; }
.bar-fill.emerald { background: var(--accent-emerald); }
.late { color: var(--accent-rose); font-style: normal; }
.muted { color: var(--text-muted); font-size: 12.5px; }
.ov-list, .act-list { display: flex; flex-direction: column; gap: 6px; }
.ov-row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 14px; border: 1px solid var(--glass-border); border-radius: 18px; background: transparent; color: inherit; font: inherit; font-size: 13px; text-align: start; cursor: pointer; }
.ov-row:hover { background: rgba(139, 92, 246, .1); }
.late-pill { padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; background: rgba(248, 113, 113, .16); color: var(--accent-rose); }
.late-members { display: flex; gap: 6px; flex-wrap: wrap; }
.td-grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.act-row { display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 4px 2px; }
.act-row small { color: var(--text-muted); white-space: nowrap; }
.act-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-cyan); flex: none; }
@media (max-width: 900px) { .ins-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
