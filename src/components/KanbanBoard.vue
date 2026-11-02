<script setup>
import { computed, ref } from 'vue'
import { Flag, ListChecks, CalendarDays } from 'lucide-vue-next'
import { extras, tagColor } from '../services/extras.js'
import { t } from '../services/i18n.js'
import { stripRich } from '../services/richtext.js'

const props = defineProps({
  tasks: { type: Array, required: true },
  statusOf: { type: Function, required: true },
  canMove: { type: Function, required: true },
  dateLabel: { type: Function, required: true }
})
const emit = defineEmits(['open', 'move'])

const COLUMNS = [
  { key: 'To do', accent: 'var(--text-muted)' },
  { key: 'In progress', accent: 'var(--accent-cyan)' },
  { key: 'Completed', accent: 'var(--accent-emerald)' },
  { key: 'Blocked', accent: 'var(--accent-rose)' }
]
const byColumn = computed(() => Object.fromEntries(COLUMNS.map(c => [c.key, props.tasks.filter(task => props.statusOf(task) === c.key)])))

const dragId = ref('')
const overCol = ref('')
const isLate = task => props.statusOf(task) !== 'Completed' && task.endDate && new Date(task.endDate) < new Date(new Date().toDateString())

function onDrop(col) {
  const task = props.tasks.find(x => String(x._id) === dragId.value)
  dragId.value = ''; overCol.value = ''
  if (task && props.statusOf(task) !== col) emit('move', task, col)
}
</script>

<template>
  <div class="kanban">
    <section
      v-for="col in COLUMNS"
      :key="col.key"
      class="kb-col"
      :class="{ over: overCol === col.key }"
      @dragover.prevent="overCol = col.key"
      @dragleave="overCol === col.key && (overCol = '')"
      @drop.prevent="onDrop(col.key)"
    >
      <header class="kb-head">
        <span class="kb-dot" :style="{ background: col.accent }"></span>
        <strong>{{ t(col.key) }}</strong>
        <span class="count-pill">{{ byColumn[col.key].length }}</span>
      </header>
      <div class="kb-list">
        <article
          v-for="task in byColumn[col.key]"
          :key="task._id"
          class="kb-card"
          :class="{ dragging: dragId === String(task._id), locked: !canMove(task) }"
          :draggable="canMove(task)"
          :title="canMove(task) ? '' : 'Only assigned members can move this task'"
          @dragstart="dragId = String(task._id)"
          @dragend="dragId = ''; overCol = ''"
          @click="emit('open', task)"
        >
          <div v-if="extras.get(task._id).tags.length" class="kb-tags">
            <span v-for="tag in extras.get(task._id).tags" :key="tag" class="tag-chip" :style="tagColor(tag)">{{ tag }}</span>
          </div>
          <strong dir="auto">{{ task.title }}</strong>
          <p dir="auto">{{ stripRich(task.description) }}</p>
          <div class="kb-meta">
            <span v-if="extras.get(task._id).priority" class="prio-badge" :class="extras.get(task._id).priority"><Flag :size="10" /> {{ extras.get(task._id).priority }}</span>
            <span v-if="extras.progress(task._id).total" class="kb-sub"><ListChecks :size="12" /> {{ extras.progress(task._id).done }}/{{ extras.progress(task._id).total }}</span>
            <span class="due-date" :class="{ late: isLate(task) }"><CalendarDays :size="12" /> {{ dateLabel(task.endDate) }}</span>
          </div>
          <div class="kb-foot">
            <span class="role-badge">{{ task.team?.name || 'General' }}</span>
            <span class="kb-people">
              <span v-for="m in (task.assignees || []).slice(0, 3)" :key="m._id || m" class="mini-avatar">{{ `${m.fname || ''} ${m.lname || ''}`.trim().split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase() || '?' }}</span>
            </span>
          </div>
        </article>
        <div v-if="!byColumn[col.key].length" class="kb-empty">Drop tasks here</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.kanban { display: grid; grid-template-columns: repeat(4, minmax(220px, 1fr)); gap: 14px; padding: 18px; overflow-x: auto; }
.kb-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 12px; border: 1px solid var(--glass-border); border-radius: 26px; background: rgba(255, 255, 255, 0.02); transition: border-color .15s, background .15s; }
.kb-col.over { border-color: rgba(139, 92, 246, .7); background: rgba(139, 92, 246, .08); }
.kb-head { display: flex; align-items: center; gap: 8px; padding: 2px 6px; }
.kb-dot { width: 9px; height: 9px; border-radius: 50%; }
.kb-list { display: flex; flex-direction: column; gap: 10px; min-height: 80px; }
.kb-card { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--glass-border); border-radius: 22px; background: var(--glass-bg, rgba(255,255,255,.04)); cursor: grab; transition: transform .15s, box-shadow .15s; }
.kb-card:hover { transform: translateY(-2px); box-shadow: var(--glass-shadow); }
.kb-card.locked { cursor: pointer; }
.kb-card.dragging { opacity: .4; }
.kb-card strong { font-size: 13.5px; overflow-wrap: anywhere; }
.kb-card p { margin: 0; font-size: 12px; color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.kb-meta, .kb-foot, .kb-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.kb-foot { justify-content: space-between; }
.kb-people { display: flex; }
.kb-people .mini-avatar { margin-inline-start: -6px; }
.kb-sub { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); }
.kb-empty { padding: 22px 10px; text-align: center; font-size: 12px; color: var(--text-muted); border: 1.5px dashed var(--glass-border); border-radius: 20px; }
@media (max-width: 900px) { .kanban { grid-template-columns: repeat(4, 260px); } }
</style>
