<script setup>
// "My tasks" card plus one summary card per team member: how many tasks they have, in which status, with which priority.
import { computed } from 'vue'
import { t } from '../services/i18n.js'

const props = defineProps({
  me: { type: Object, default: null },
  members: { type: Array, required: true },
  memberTasks: { type: Function, required: true }, // member -> [{ task, status }]
  labelOf: { type: Function, required: true }, // raw status -> 'Completed' | 'In progress' | 'To do' | 'Blocked'
  priorityOf: { type: Function, required: true }, // task -> 'low' | 'medium' | 'high' | 'urgent' | ''
  getId: { type: Function, required: true }
})
const emit = defineEmits(['member', 'open-tasks'])

const STATUSES = [
  { key: 'Completed', cls: 'complete' },
  { key: 'In progress', cls: 'inProgress' },
  { key: 'To do', cls: 'toDo' },
  { key: 'Blocked', cls: 'fail' }
]
const PRIOS = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' }
]
const nameOf = m => `${m?.fname || ''} ${m?.lname || ''}`.trim() || m?.email || 'Member'
const initials = n => n.split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase()

function summarize(member, mine = false) {
  const list = props.memberTasks(member) || []
  const status = Object.fromEntries(STATUSES.map(s => [s.key, 0]))
  const prio = Object.fromEntries(PRIOS.map(p => [p.key, 0]))
  for (const x of list) {
    status[props.labelOf(x.status)]++
    const p = props.priorityOf(x.task)
    if (p in prio) prio[p]++
  }
  const total = list.length
  return {
    id: String(props.getId(member)), member, mine, name: mine ? t('My tasks') : nameOf(member), total, status, prio,
    pct: total ? Math.round(status.Completed / total * 100) : 0
  }
}

const mineCard = computed(() => props.me ? summarize(props.me, true) : null)
const cards = computed(() => props.members
  .filter(m => String(props.getId(m)) !== String(props.getId(props.me || {})))
  .map(m => summarize(m))
  .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)))
</script>

<template>
  <section class="people-summary" aria-label="Task summary per person">
    <article v-if="mineCard" class="ps-card ps-mine glass-panel">
      <header>
        <span class="ps-avatar">{{ initials(nameOf(me)) }}</span>
        <div class="ps-title"><strong>{{ t('My tasks') }}</strong><small>{{ mineCard.total }} {{ t(mineCard.total === 1 ? 'task' : 'tasks') }}</small></div>
        <span class="ps-pct">{{ mineCard.pct }}%</span>
      </header>
      <div class="ps-bar"><span :style="{ width: mineCard.pct + '%' }"></span></div>
      <div class="ps-status">
        <span v-for="s in STATUSES" :key="s.key" class="ps-chip" :class="s.cls"><b>{{ mineCard.status[s.key] }}</b> {{ t(s.key) }}</span>
      </div>
      <div class="ps-prio">
        <span v-for="p in PRIOS" :key="p.key" v-show="mineCard.prio[p.key]" class="prio-badge" :class="p.key">{{ mineCard.prio[p.key] }} {{ t(p.label) }}</span>
        <small v-if="!mineCard.total" class="muted">{{ t('No tasks assigned to you yet.') }}</small>
      </div>
    </article>

    <button v-for="c in cards" :key="c.id" type="button" class="ps-card glass-panel ps-person" :class="{ empty: !c.total }" @click="emit('member', c.member)">
      <header>
        <span class="ps-avatar">{{ initials(c.name) }}</span>
        <div class="ps-title"><strong>{{ c.name }}</strong><small>{{ c.total }} {{ t(c.total === 1 ? 'task' : 'tasks') }}</small></div>
        <span class="ps-pct">{{ c.pct }}%</span>
      </header>
      <div class="ps-bar"><span :style="{ width: c.pct + '%' }"></span></div>
      <div class="ps-status">
        <span v-for="s in STATUSES" :key="s.key" v-show="c.status[s.key]" class="ps-chip" :class="s.cls"><b>{{ c.status[s.key] }}</b> {{ t(s.key) }}</span>
        <small v-if="!c.total" class="muted">{{ t('No tasks') }}</small>
      </div>
      <div class="ps-prio">
        <span v-for="p in PRIOS" :key="p.key" v-show="c.prio[p.key]" class="prio-badge" :class="p.key">{{ c.prio[p.key] }} {{ t(p.label) }}</span>
      </div>
    </button>
  </section>
</template>

<style scoped>
.people-summary { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; margin-bottom: 18px; }
.ps-card { text-align: start; padding: 16px; border-radius: 20px; display: grid; gap: 10px; align-content: start; color: inherit; font: inherit; }
.ps-person { cursor: pointer; transition: transform .15s ease, border-color .15s ease; }
.ps-person:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--accent-violet, #8b5cf6) 55%, transparent); }
.ps-person.empty { opacity: .6; }
.ps-mine { border-color: color-mix(in srgb, var(--accent-violet, #8b5cf6) 60%, transparent); grid-column: span 1; }
header { display: flex; align-items: center; gap: 10px; }
.ps-avatar { width: 36px; height: 36px; flex: none; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: .8rem; background: linear-gradient(135deg, #8b5cf6, #38bdf8); color: #fff; }
.ps-title { display: grid; min-width: 0; flex: 1; }
.ps-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ps-title small { opacity: .7; }
.ps-pct { font-weight: 800; font-size: 1.05rem; }
.ps-bar { height: 7px; border-radius: 99px; overflow: hidden; background: color-mix(in srgb, currentColor 14%, transparent); }
.ps-bar span { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #8b5cf6, #10b981); transition: width .3s ease; }
.ps-status, .ps-prio { display: flex; flex-wrap: wrap; gap: 6px; min-height: 22px; }
.ps-chip { font-size: .74rem; padding: 2px 10px; border-radius: 99px; border: 1px solid currentColor; white-space: nowrap; }
.ps-chip b { font-weight: 800; }
.ps-chip.complete { color: #10b981; }
.ps-chip.inProgress { color: #38bdf8; }
.ps-chip.toDo { color: #94a3b8; }
.ps-chip.fail { color: #ef4444; }
:root[data-theme="light"] .ps-chip.complete { color: #047857; }
:root[data-theme="light"] .ps-chip.inProgress { color: #0369a1; }
:root[data-theme="light"] .ps-chip.toDo { color: #475569; }
</style>
