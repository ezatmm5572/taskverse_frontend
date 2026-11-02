<script setup>
import { computed, ref } from 'vue'
import { Bold, Italic, List, Code, Link2 } from 'lucide-vue-next'
import { renderRich } from '../services/richtext.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  rows: { type: Number, default: 5 },
  handles: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue'])

const tab = ref(props.disabled ? 'preview' : 'write')
const area = ref(null)
const html = computed(() => renderRich(props.modelValue, props.handles))

function wrap(before, after = before, placeholder = 'text') {
  const el = area.value
  if (!el) return
  const { selectionStart: a, selectionEnd: b, value } = el
  const picked = value.slice(a, b) || placeholder
  emit('update:modelValue', value.slice(0, a) + before + picked + after + value.slice(b))
  requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + picked.length) })
}
function bullet() {
  const el = area.value
  if (!el) return
  const { selectionStart: a, selectionEnd: b, value } = el
  const start = value.lastIndexOf('\n', a - 1) + 1
  const block = value.slice(start, b || a) || 'item'
  emit('update:modelValue', value.slice(0, start) + block.split('\n').map(l => '- ' + l.replace(/^\s*[-*]\s+/, '')).join('\n') + value.slice(b || a))
  requestAnimationFrame(() => el.focus())
}
</script>

<template>
  <div class="rt" :class="{ disabled }">
    <div v-if="!disabled" class="rt-bar">
      <div class="rt-tools">
        <button type="button" title="Bold" @click="wrap('**')"><Bold :size="14" /></button>
        <button type="button" title="Italic" @click="wrap('_')"><Italic :size="14" /></button>
        <button type="button" title="Bulleted list" @click="bullet"><List :size="14" /></button>
        <button type="button" title="Code" @click="wrap('`')"><Code :size="14" /></button>
        <button type="button" title="Link" @click="wrap('[', '](https://)', 'link text')"><Link2 :size="14" /></button>
      </div>
      <div class="rt-tabs">
        <button type="button" :class="{ on: tab === 'write' }" @click="tab = 'write'">Write</button>
        <button type="button" :class="{ on: tab === 'preview' }" @click="tab = 'preview'">Preview</button>
      </div>
    </div>
    <textarea v-if="!disabled && tab === 'write'" ref="area" dir="auto" :rows="rows" :value="modelValue" required minlength="3" @input="emit('update:modelValue', $event.target.value)"></textarea>
    <div v-else class="rt-view" dir="auto" v-html="html || '<p class=&quot;rt-empty&quot;>Nothing to preview.</p>'"></div>
  </div>
</template>

<style scoped>
.rt { display: flex; flex-direction: column; gap: 8px; }
.rt-bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.rt-tools, .rt-tabs { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--glass-border); border-radius: 999px; }
.rt-tools button, .rt-tabs button { display: grid; place-items: center; min-width: 30px; height: 28px; padding: 0 10px; border: 0; border-radius: 999px; background: transparent; color: var(--text-muted); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.rt-tools button:hover, .rt-tabs button:hover { background: rgba(139, 92, 246, .14); }
.rt-tabs button.on { background: var(--primary-gradient, #8b5cf6); color: #fff; }
.rt-view { min-height: 90px; padding: 12px 16px; border: 1px solid var(--glass-border); border-radius: 20px; font-size: 13.5px; line-height: 1.6; overflow-wrap: anywhere; }
.rt.disabled .rt-view { border-style: dashed; }
.rt-view :deep(p) { margin: 0 0 6px; }
.rt-view :deep(ul) { margin: 4px 0 8px; padding-inline-start: 20px; }
.rt-view :deep(code) { padding: 1px 6px; border-radius: 8px; background: rgba(139, 92, 246, .16); font-size: 12px; }
.rt-view :deep(a) { color: var(--accent-cyan); text-decoration: underline; }
.rt-view :deep(.mention) { padding: 0 6px; border-radius: 99px; background: rgba(56, 189, 248, .16); color: var(--accent-cyan); font-weight: 600; }
.rt-view :deep(.rt-empty) { color: var(--text-muted); }
</style>
