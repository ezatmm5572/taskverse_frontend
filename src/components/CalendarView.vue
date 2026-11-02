<script setup>
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { lang, t } from '../services/i18n.js'

const props = defineProps({
  tasks: { type: Array, required: true },
  statusOf: { type: Function, required: true }
})
const emit = defineEmits(['open'])

const cursor = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayIso = iso(new Date())

const title = computed(() => cursor.value.toLocaleDateString(lang.value === 'ar' ? 'ar' : undefined, { month: 'long', year: 'numeric' }))
const weekdays = computed(() => {
  const base = new Date(2024, 0, 7) // a Sunday
  return Array.from({ length: 7 }, (_, i) => new Date(base.getFullYear(), 0, 7 + i).toLocaleDateString(lang.value === 'ar' ? 'ar' : undefined, { weekday: 'short' }))
})

const tasksByDay = computed(() => {
  const map = {}
  props.tasks.forEach(task => {
    if (!task.endDate) return
    const d = new Date(task.endDate)
    ;(map[iso(d)] ||= []).push(task)
  })
  return map
})

const cells = computed(() => {
  const y = cursor.value.getFullYear(), m = cursor.value.getMonth()
  const lead = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const out = []
  for (let i = 0; i < lead; i++) out.push(null)
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, m, d)
    out.push({ d, key: iso(date), tasks: tasksByDay.value[iso(date)] || [] })
  }
  return out
})
const shift = n => { cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + n, 1) }
const goToday = () => { const n = new Date(); cursor.value = new Date(n.getFullYear(), n.getMonth(), 1) }
const cls = task => ({ done: props.statusOf(task) === 'Completed', blocked: props.statusOf(task) === 'Blocked', late: props.statusOf(task) !== 'Completed' && new Date(task.endDate) < new Date(new Date().toDateString()) })
</script>

<template>
  <div class="cal">
    <div class="cal-bar">
      <button class="icon-btn tiny-btn" @click="shift(-1)"><ChevronLeft :size="16" /></button>
      <strong class="cal-title">{{ title }}</strong>
      <button class="icon-btn tiny-btn" @click="shift(1)"><ChevronRight :size="16" /></button>
      <span style="flex: 1"></span>
      <button class="secondary-btn tiny-btn" style="width:auto" @click="goToday">{{ t('Today') }}</button>
    </div>
    <div class="cal-grid">
      <div v-for="w in weekdays" :key="w" class="cal-wd">{{ w }}</div>
      <div v-for="(c, i) in cells" :key="i" class="cal-cell" :class="{ empty: !c, today: c && c.key === todayIso }">
        <template v-if="c">
          <span class="cal-day">{{ c.d }}</span>
          <button v-for="task in c.tasks.slice(0, 3)" :key="task._id" class="cal-task" :class="cls(task)" dir="auto" :title="task.title" @click="emit('open', task)">{{ task.title }}</button>
          <span v-if="c.tasks.length > 3" class="cal-more">+{{ c.tasks.length - 3 }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal { padding: 18px; display: flex; flex-direction: column; gap: 12px; }
.cal-bar { display: flex; align-items: center; gap: 10px; }
.cal-title { min-width: 150px; text-align: center; font-size: 15px; }
.cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.cal-wd { text-align: center; font-size: 11px; font-weight: 700; letter-spacing: 1px; color: var(--text-dim); padding: 4px 0; text-transform: uppercase; }
.cal-cell { min-height: 96px; display: flex; flex-direction: column; gap: 4px; padding: 6px; border: 1px solid var(--glass-border); border-radius: 18px; min-width: 0; }
.cal-cell.empty { border-color: transparent; }
.cal-cell.today { border-color: rgba(139, 92, 246, .7); background: rgba(139, 92, 246, .08); }
.cal-day { font-size: 11.5px; font-weight: 700; color: var(--text-muted); padding-inline: 4px; }
.cal-task { border: 0; border-radius: 99px; padding: 3px 9px; font: inherit; font-size: 11px; font-weight: 600; text-align: start; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: rgba(56, 189, 248, .16); color: var(--accent-cyan); }
.cal-task.done { background: rgba(52, 211, 153, .16); color: var(--accent-emerald); text-decoration: line-through; }
.cal-task.late, .cal-task.blocked { background: rgba(248, 113, 113, .16); color: var(--accent-rose); }
.cal-more { font-size: 11px; color: var(--text-muted); padding-inline: 6px; }
@media (max-width: 700px) { .cal-cell { min-height: 70px; padding: 4px; } .cal-task { font-size: 10px; padding: 2px 6px; } }
</style>
