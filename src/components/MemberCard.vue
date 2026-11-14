<script setup>
// One member at a glance: identity, account role, teams and a full task summary, so nobody has to open the profile.
import { Mail, CalendarDays, UserRound, Users, AlertTriangle } from 'lucide-vue-next'
import { t } from '../services/i18n.js'

defineProps({ card: { type: Object, required: true } })
defineEmits(['open'])

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
</script>

<template>
  <article class="mc glass-panel" :class="{ inactive: !card.active, me: card.me }" tabindex="0" role="button" :aria-label="card.name" @click="$emit('open', card.member)" @keydown.enter.self="$emit('open', card.member)">
    <header class="mc-head">
      <span class="mc-avatar" :class="'r-' + card.role">{{ card.initials }}</span>
      <div class="mc-id">
        <strong dir="auto" :title="card.name + ' ' + card.title">{{ card.name }} <em v-if="card.me">({{ t('you') }})</em></strong>
        <span v-if="card.title" class="mc-title" dir="auto">{{ card.title }}</span>
        <small><Mail :size="12" /> {{ card.email }}</small>
      </div>
      <span class="mc-pct" :title="t('Tasks completed')">{{ card.summary.pct }}%</span>
    </header>

    <div class="mc-badges">
      <span class="role-badge" :class="'r-' + card.role">{{ t(card.roleLabel) }}</span>
      <span class="status-badge" :class="card.confirmed ? 'confirmed' : 'pending'">{{ t(card.confirmed ? 'Confirmed' : 'Pending') }}</span>
      <span v-if="!card.active" class="status-badge pending">{{ t('Deactivated') }}</span>
    </div>

    <dl class="mc-facts">
      <div><dt><UserRound :size="12" /> {{ t('Gender') }}</dt><dd>{{ card.gender || '—' }}</dd></div>
      <div><dt><CalendarDays :size="12" /> {{ t('Joined') }}</dt><dd>{{ card.joined }}</dd></div>
    </dl>

    <section class="mc-block">
      <div class="mc-label"><Users :size="12" /> {{ t('TEAMS') }} · {{ card.teams.length }}</div>
      <div class="mc-chips">
        <span v-for="x in card.teams" :key="x.name" class="mc-team">{{ x.name }} <em>{{ t(x.role) }}</em></span>
        <small v-if="!card.teams.length" class="muted">{{ t('Not part of any team.') }}</small>
      </div>
    </section>

    <section class="mc-block">
      <div class="mc-label">{{ t('TASKS') }} · {{ card.summary.total }}
        <span v-if="card.summary.late" class="mc-late"><AlertTriangle :size="11" /> {{ card.summary.late }} {{ t('overdue') }}</span>
      </div>
      <div class="mc-bar"><span :style="{ width: card.summary.pct + '%' }"></span></div>
      <div class="mc-chips">
        <span v-for="s in STATUSES" :key="s.key" v-show="card.summary.status[s.key]" class="mc-chip" :class="s.cls"><b>{{ card.summary.status[s.key] }}</b> {{ t(s.key) }}</span>
        <small v-if="!card.summary.total" class="muted">{{ t('No tasks assigned.') }}</small>
      </div>
      <div class="mc-chips">
        <span v-for="p in PRIOS" :key="p.key" v-show="card.summary.prio[p.key]" class="prio-badge" :class="p.key">{{ card.summary.prio[p.key] }} {{ t(p.label) }}</span>
      </div>
    </section>
  </article>
</template>

<style scoped>
.mc { display: grid; gap: 12px; align-content: start; padding: 18px; border-radius: 22px; cursor: pointer; transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; position: relative; overflow: hidden; }
.mc::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, #8b5cf6, #38bdf8); opacity: .8; }
.mc:hover, .mc:focus-visible { transform: translateY(-3px); border-color: color-mix(in srgb, var(--primary, #8b5cf6) 60%, transparent); box-shadow: 0 14px 34px -18px color-mix(in srgb, var(--primary, #8b5cf6) 70%, transparent); outline: none; }
.mc.me { border-color: color-mix(in srgb, var(--primary, #8b5cf6) 55%, transparent); }
.mc.inactive { opacity: .6; }
.mc-head { display: flex; align-items: center; gap: 12px; }
.mc-avatar { width: 46px; height: 46px; flex: none; border-radius: 16px; display: grid; place-items: center; font-weight: 800; color: #fff; background: linear-gradient(135deg, #8b5cf6, #6366f1); }
.mc-avatar.r-admin { background: linear-gradient(135deg, #f43f5e, #8b5cf6); }
.mc-avatar.r-viewer { background: linear-gradient(135deg, #38bdf8, #6366f1); }
.mc-id { display: grid; min-width: 0; flex: 1; }
.mc-id strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
.mc-title { font-size: 12px; font-weight: 600; color: var(--primary-light, #a78bfa); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-id em { font-style: normal; opacity: .65; font-weight: 500; }
.mc-id small { display: flex; align-items: center; gap: 5px; opacity: .7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-pct { font-weight: 800; font-size: 1.15rem; flex: none; }
.mc-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.mc-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0; }
.mc-facts div { display: grid; gap: 2px; padding: 8px 10px; border-radius: 12px; background: color-mix(in srgb, currentColor 6%, transparent); }
.mc-facts dt { display: flex; align-items: center; gap: 5px; font-size: 11px; opacity: .65; text-transform: uppercase; letter-spacing: .05em; }
.mc-facts dd { margin: 0; font-weight: 600; font-size: 13px; text-transform: capitalize; }
.mc-block { display: grid; gap: 8px; padding-top: 12px; border-top: 1px solid var(--glass-border); }
.mc-label { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: .08em; opacity: .75; }
.mc-late { margin-inline-start: auto; display: inline-flex; align-items: center; gap: 4px; color: #f59e0b; font-weight: 700; letter-spacing: 0; }
.mc-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.mc-team { font-size: 12px; padding: 3px 10px; border-radius: 99px; border: 1px solid var(--glass-border); background: color-mix(in srgb, currentColor 5%, transparent); }
.mc-team em { font-style: normal; opacity: .6; font-size: 11px; margin-inline-start: 4px; }
.mc-bar { height: 7px; border-radius: 99px; overflow: hidden; background: color-mix(in srgb, currentColor 14%, transparent); }
.mc-bar span { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #8b5cf6, #10b981); transition: width .3s ease; }
.mc-chip { font-size: 12px; padding: 2px 10px; border-radius: 99px; border: 1px solid currentColor; white-space: nowrap; }
.mc-chip.complete { color: #10b981; }
.mc-chip.inProgress { color: #38bdf8; }
.mc-chip.toDo { color: #94a3b8; }
.mc-chip.fail { color: #ef4444; }
:root[data-theme="light"] .mc-chip.complete { color: #047857; }
:root[data-theme="light"] .mc-chip.inProgress { color: #0369a1; }
:root[data-theme="light"] .mc-chip.toDo { color: #475569; }
</style>
