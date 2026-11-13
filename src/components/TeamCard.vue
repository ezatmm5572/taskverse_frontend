<script setup>
// One team at a glance: colour-coded header, leads, member avatars, task health and quick actions.
import { Users, Pencil, Trash2, UserPlus, LayoutDashboard, CalendarDays, AlertTriangle, Crown } from 'lucide-vue-next'
import { t } from '../services/i18n.js'

defineProps({ card: { type: Object, required: true } })
defineEmits(['open', 'dashboard', 'delete'])
</script>

<template>
  <article class="tc glass-panel" :style="{ '--tc-a': card.hue[0], '--tc-b': card.hue[1] }" tabindex="0" role="button" :aria-label="card.name" @click="$emit('open', card.team)" @keydown.enter.self="$emit('open', card.team)">
    <div class="tc-banner">
      <span class="tc-icon"><Users :size="22" /></span>
      <span class="tc-pct" :title="t('Tasks completed')"><b>{{ card.pct }}%</b><small>{{ t('done') }}</small></span>
      <button type="button" class="tc-edit" :title="t('Open / edit team')" :aria-label="t('Open / edit team')" @click.stop="$emit('open', card.team)"><Pencil :size="14" /></button>
    </div>

    <div class="tc-body">
      <h3 dir="auto">{{ card.name }}</h3>
      <p class="tc-meta"><CalendarDays :size="12" /> {{ t('Created') }} {{ card.created }} · {{ card.count }} {{ t(card.count === 1 ? 'member' : 'members') }}</p>

      <div v-if="card.leads.length" class="tc-leads"><Crown :size="12" /> <span>{{ card.leads.join(', ') }}</span></div>

      <div class="tc-avatars">
        <span v-for="m in card.avatars" :key="m.id" class="tc-av" :title="m.name">{{ m.initials }}</span>
        <span v-if="card.more" class="tc-av more">+{{ card.more }}</span>
        <small v-if="!card.count" class="muted">{{ t('No members yet') }}</small>
      </div>

      <div class="tc-bar" role="progressbar" :aria-valuenow="card.pct" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: card.pct + '%' }"></span></div>
      <div class="tc-stats">
        <span class="tc-stat"><b>{{ card.total }}</b> {{ t('Tasks') }}</span>
        <span class="tc-stat open"><b>{{ card.open }}</b> {{ t('open') }}</span>
        <span class="tc-stat done"><b>{{ card.done }}</b> {{ t('Completed') }}</span>
        <span v-if="card.late" class="tc-stat late"><AlertTriangle :size="11" /> <b>{{ card.late }}</b> {{ t('overdue') }}</span>
      </div>
    </div>

    <footer class="tc-actions">
      <button type="button" class="secondary-btn" @click.stop="$emit('dashboard', card.team)"><LayoutDashboard :size="14" /> {{ t('Dashboard') }}</button>
      <button type="button" class="secondary-btn" @click.stop="$emit('open', card.team)"><UserPlus :size="14" /> {{ t('Add members') }}</button>
      <button v-if="card.canDelete" type="button" class="icon-btn danger-btn" :title="t('Delete team')" :aria-label="t('Delete team')" @click.stop="$emit('delete', card.team)"><Trash2 :size="15" /></button>
    </footer>
  </article>
</template>

<style scoped>
.tc { --tc-a: #8b5cf6; --tc-b: #38bdf8; display: flex; flex-direction: column; border-radius: 24px; overflow: hidden; cursor: pointer; padding: 0; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
.tc:hover, .tc:focus-visible { transform: translateY(-4px); border-color: color-mix(in srgb, var(--tc-a) 65%, transparent); box-shadow: 0 18px 40px -20px var(--tc-a); outline: none; }
.tc-banner { position: relative; display: flex; align-items: flex-end; justify-content: space-between; height: 84px; padding: 14px 16px; background: linear-gradient(135deg, var(--tc-a), var(--tc-b)); }
.tc-banner::after { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 85% 0%, rgba(255,255,255,.28), transparent 55%); pointer-events: none; }
.tc-icon { position: relative; z-index: 1; width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center; color: #fff; background: rgba(255,255,255,.22); border: 1px solid rgba(255,255,255,.4); backdrop-filter: blur(6px); margin-bottom: -26px; box-shadow: 0 8px 20px -8px rgba(0,0,0,.5); }
.tc-pct { position: relative; z-index: 1; display: grid; justify-items: end; color: #fff; line-height: 1.05; }
.tc-pct b { font-size: 1.5rem; font-family: 'Space Grotesk', sans-serif; }
.tc-pct small { font-size: 11px; opacity: .85; letter-spacing: .06em; text-transform: uppercase; }
.tc-edit { position: absolute; z-index: 2; top: 10px; inset-inline-start: 10px; width: 28px; height: 28px; border-radius: 10px; display: grid; place-items: center; color: #fff; background: rgba(0,0,0,.25); border: 1px solid rgba(255,255,255,.3); cursor: pointer; }
.tc-edit:hover { background: rgba(0,0,0,.4); }
.tc-body { display: grid; gap: 10px; padding: 34px 20px 8px; flex: 1; align-content: start; }
.tc-body h3 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tc-meta { margin: 0 !important; display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
.tc-leads { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #f59e0b; min-width: 0; }
.tc-leads span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); }
.tc-avatars { display: flex; align-items: center; min-height: 32px; }
.tc-av { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-size: 10.5px; font-weight: 800; color: #fff; background: linear-gradient(135deg, var(--tc-a), var(--tc-b)); border: 2px solid var(--bg-base, #0b0b14); margin-inline-end: -9px; transition: transform .15s ease; }
.tc-av:hover { transform: translateY(-3px); z-index: 2; }
.tc-av.more { background: color-mix(in srgb, currentColor 14%, var(--bg-base, #0b0b14)); color: inherit; }
.tc-bar { height: 7px; border-radius: 99px; overflow: hidden; background: color-mix(in srgb, currentColor 14%, transparent); margin-top: 6px; }
.tc-bar span { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--tc-a), #10b981); transition: width .35s ease; }
.tc-stats { display: flex; flex-wrap: wrap; gap: 6px; }
.tc-stat { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 3px 10px; border-radius: 99px; border: 1px solid var(--glass-border); background: color-mix(in srgb, currentColor 5%, transparent); white-space: nowrap; }
.tc-stat.open { color: #38bdf8; border-color: rgba(56,189,248,.45); }
.tc-stat.done { color: #10b981; border-color: rgba(16,185,129,.45); }
.tc-stat.late { color: #f59e0b; border-color: rgba(245,158,11,.5); }
:root[data-theme="light"] .tc-stat.open { color: #0369a1; }
:root[data-theme="light"] .tc-stat.done { color: #047857; }
:root[data-theme="light"] .tc-av { border-color: #fff; }
.tc-actions { display: flex; align-items: center; gap: 8px; padding: 14px 20px 18px; margin-top: 6px; border-top: 1px solid var(--glass-border); }
.tc-actions .secondary-btn { width: auto; }
</style>
