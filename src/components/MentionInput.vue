<script setup>
import { computed, ref } from 'vue'
import { handleOf } from '../services/richtext.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  members: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'submit'])

const input = ref(null)
const caret = ref(0)
const active = ref(0)
const dismissed = ref(false)

const query = computed(() => {
  const m = /(?:^|\s)@([\p{L}\p{N}_]*)$/u.exec(props.modelValue.slice(0, caret.value))
  return m ? m[1].toLowerCase() : null
})
const options = computed(() => {
  if (query.value === null || dismissed.value) return []
  const q = query.value
  return props.members
    .map(m => ({ m, h: handleOf(m) }))
    .filter(x => !q || x.h.toLowerCase().includes(q))
    .slice(0, 6)
})

function sync(e) {
  caret.value = e.target.selectionStart
  dismissed.value = false
  active.value = 0
  emit('update:modelValue', e.target.value)
}
function pick(opt) {
  const before = props.modelValue.slice(0, caret.value).replace(/@([\p{L}\p{N}_]*)$/u, `@${opt.h} `)
  const next = before + props.modelValue.slice(caret.value)
  emit('update:modelValue', next)
  requestAnimationFrame(() => { input.value.focus(); input.value.setSelectionRange(before.length, before.length); caret.value = before.length })
}
function onKey(e) {
  if (options.value.length) {
    if (e.key === 'ArrowDown') { e.preventDefault(); active.value = (active.value + 1) % options.value.length; return }
    if (e.key === 'ArrowUp') { e.preventDefault(); active.value = (active.value - 1 + options.value.length) % options.value.length; return }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(options.value[active.value]); return }
    if (e.key === 'Escape') { e.preventDefault(); dismissed.value = true; return }
  }
  if (e.key === 'Enter') { e.preventDefault(); emit('submit') }
}
</script>

<template>
  <div class="mi">
    <input ref="input" dir="auto" :value="modelValue" :placeholder="placeholder" :disabled="disabled" maxlength="500" autocomplete="off"
      @input="sync" @click="caret = $event.target.selectionStart" @keyup="caret = $event.target.selectionStart" @keydown="onKey" />
    <ul v-if="options.length" class="mi-list" role="listbox">
      <li v-for="(o, i) in options" :key="o.m._id" role="option" :class="{ on: i === active }" @mousedown.prevent="pick(o)">
        <strong>@{{ o.h }}</strong>
        <small>{{ o.m.email }}</small>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.mi { position: relative; flex: 1; min-width: 0; }
.mi input { width: 100%; }
.mi-list { position: absolute; inset-inline: 0; bottom: calc(100% + 6px); z-index: 20; margin: 0; padding: 6px; list-style: none; display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--glass-border); border-radius: 20px; background: var(--surface, #14172b); box-shadow: var(--glass-shadow); }
.mi-list li { display: flex; align-items: baseline; gap: 8px; padding: 8px 12px; border-radius: 14px; cursor: pointer; font-size: 13px; }
.mi-list li.on, .mi-list li:hover { background: rgba(139, 92, 246, .2); }
.mi-list small { color: var(--text-muted); font-size: 11px; }
</style>
