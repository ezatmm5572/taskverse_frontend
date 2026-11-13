<script setup>
// One organised box: a row per thing (Task status, Priority, Teams ...), a column per action (View / Add / Edit / Delete / Share).
// Tick a square to allow it. Row, column and "all" boxes switch many squares at once.
import { PERMISSION_MATRIX, MATRIX_COLUMNS } from '../services/access.js'
import { t } from '../services/i18n.js'

const props = defineProps({
  isOn: { type: Function, required: true }, // key -> boolean
  isCustom: { type: Function, default: () => false }, // key -> boolean (differs from the role default)
  disabled: Boolean
})
const emit = defineEmits(['change'])

const keysOfRow = row => MATRIX_COLUMNS.map(c => row[c.id]).filter(Boolean)
const allRows = PERMISSION_MATRIX.flatMap(g => g.rows)
const keysOfColumn = col => allRows.map(r => r[col]).filter(Boolean)
const allKeys = allRows.flatMap(keysOfRow)

const state = keys => {
  const on = keys.filter(props.isOn).length
  return { checked: !!keys.length && on === keys.length, partial: on > 0 && on < keys.length, on, total: keys.length }
}
const setMany = (keys, on, label) => {
  if (props.disabled) return
  const changes = {}
  for (const k of keys) if (props.isOn(k) !== on) changes[k] = on
  if (Object.keys(changes).length) emit('change', changes, label)
}
const toggle = (keys, label, e) => setMany(keys, e.target.checked, label)
</script>

<template>
  <div class="pm" :class="{ locked: disabled }">
    <div class="pm-scroll">
      <table class="pm-table">
        <thead>
          <tr>
            <th class="pm-first">
              <label class="pm-all"><input type="checkbox" class="pm-box" :checked="state(allKeys).checked" :indeterminate.prop="state(allKeys).partial" :disabled="disabled" :aria-label="t('Select all')" @change="toggle(allKeys, 'toggled every permission', $event)" /> <span>{{ t('Select all') }}</span> <em>{{ state(allKeys).on }} / {{ state(allKeys).total }}</em></label>
            </th>
            <th v-for="c in MATRIX_COLUMNS" :key="c.id">
              <label class="pm-col"><input type="checkbox" class="pm-box" :checked="state(keysOfColumn(c.id)).checked" :indeterminate.prop="state(keysOfColumn(c.id)).partial" :disabled="disabled" :aria-label="t(c.label)" @change="toggle(keysOfColumn(c.id), `toggled all “${c.label}” permissions`, $event)" /> <span>{{ t(c.label) }}</span></label>
            </th>
            <th class="pm-count">{{ t('Allowed') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="g in PERMISSION_MATRIX" :key="g.id">
            <tr class="pm-group"><td :colspan="MATRIX_COLUMNS.length + 2">{{ t(g.label) }}</td></tr>
            <tr v-for="row in g.rows" :key="row.label">
              <td class="pm-first">
                <label class="pm-row"><input type="checkbox" class="pm-box" :checked="state(keysOfRow(row)).checked" :indeterminate.prop="state(keysOfRow(row)).partial" :disabled="disabled" :aria-label="t(row.label)" @change="toggle(keysOfRow(row), `toggled “${row.label}”`, $event)" /> <strong>{{ t(row.label) }}</strong></label>
              </td>
              <td v-for="c in MATRIX_COLUMNS" :key="c.id" class="pm-cell">
                <label v-if="row[c.id]" class="pm-pick" :class="{ custom: isCustom(row[c.id]) }" :title="isCustom(row[c.id]) ? t('Differs from the role default') : ''">
                  <input type="checkbox" class="pm-box" :checked="isOn(row[c.id])" :disabled="disabled" :aria-label="`${t(row.label)}: ${t(c.label)}`" :data-perm="row[c.id]" @change="setMany([row[c.id]], $event.target.checked, `${$event.target.checked ? 'allowed' : 'blocked'} “${row.label} – ${c.label}”`)" />
                </label>
                <span v-else class="pm-na" aria-hidden="true">—</span>
              </td>
              <td class="pm-count">{{ state(keysOfRow(row)).on }} / {{ state(keysOfRow(row)).total }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.pm { border: 1px solid var(--glass-border); border-radius: 20px; overflow: hidden; background: color-mix(in srgb, var(--bg-base, #0b0b14) 55%, transparent); }
.pm.locked { opacity: .65; }
.pm-scroll { overflow-x: auto; }
.pm-table { width: 100%; min-width: 640px; border-collapse: separate; border-spacing: 0; font-size: 13px; }
.pm-table th { position: sticky; top: 0; z-index: 1; padding: 12px 10px; text-align: center; font-weight: 700; background: color-mix(in srgb, var(--primary, #8b5cf6) 16%, var(--bg-base, #0b0b14)); border-bottom: 1px solid var(--glass-border); white-space: nowrap; }
.pm-table td { padding: 10px; border-bottom: 1px solid var(--glass-border); text-align: center; }
.pm-table tbody tr:not(.pm-group):hover td { background: color-mix(in srgb, var(--primary, #8b5cf6) 7%, transparent); }
.pm-first { text-align: start !important; min-width: 210px; position: sticky; inset-inline-start: 0; background: inherit; }
.pm-table tbody .pm-first { background: color-mix(in srgb, var(--bg-base, #0b0b14) 92%, transparent); z-index: 1; }
.pm-group td { text-align: start; padding: 8px 14px; font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--primary-light, #a78bfa); background: color-mix(in srgb, var(--primary, #8b5cf6) 10%, transparent); }
.pm-all, .pm-col, .pm-row { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.pm-all em { font-style: normal; font-weight: 500; opacity: .7; font-size: 11.5px; }
.pm-pick { display: inline-grid; place-items: center; position: relative; }
.pm-pick.custom::after { content: ''; position: absolute; top: -4px; inset-inline-end: -4px; width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; }
.pm-na { opacity: .35; }
.pm-count { color: var(--text-muted); font-size: 12px; white-space: nowrap; }

/* big square tick box */
.pm-box { appearance: none; -webkit-appearance: none; width: 22px; height: 22px; margin: 0; border-radius: 7px; border: 2px solid color-mix(in srgb, var(--text, #fff) 35%, transparent); background: transparent; cursor: pointer; display: inline-grid; place-items: center; transition: background .15s, border-color .15s, transform .1s; flex: none; }
.pm-box:hover:not(:disabled) { border-color: var(--primary, #8b5cf6); transform: scale(1.06); }
.pm-box:checked { background: var(--primary, #8b5cf6); border-color: var(--primary, #8b5cf6); }
.pm-box:checked::after { content: ''; width: 6px; height: 11px; border: solid #fff; border-width: 0 2.5px 2.5px 0; transform: translateY(-1px) rotate(45deg); }
.pm-box:indeterminate { background: color-mix(in srgb, var(--primary, #8b5cf6) 55%, transparent); border-color: var(--primary, #8b5cf6); }
.pm-box:indeterminate::after { content: ''; width: 10px; height: 2.5px; background: #fff; border-radius: 2px; }
.pm-box:disabled { cursor: not-allowed; }
.pm-box:focus-visible { outline: 2px solid var(--accent-cyan, #38bdf8); outline-offset: 2px; }
</style>
