<script setup>
import { computed, ref, watch } from 'vue'
import { Lock, Eye, RotateCcw, Check, X } from 'lucide-vue-next'
import {
  access, PERMISSION_GROUPS, ALL_PERMISSIONS, ROLES, effective, userState, hasOverrides,
  setEnabled, setPreset, resetPresets, setUserOverride, resetUser
} from '../services/access.js'

// Admin-only console: master switch, role presets, per-person roles and permission overrides, history.
const props = defineProps({
  members: { type: Array, required: true },
  roleOf: { type: Function, required: true }, // member -> 'admin' | 'member' | 'viewer'
  meId: { type: String, default: '' },
  nameOf: { type: Function, required: true },
  busyRole: Boolean
})
const emit = defineEmits(['set-role', 'preview', 'stop-preview'])

const tab = ref('people')
const search = ref('')
const selectedId = ref('')

const list = computed(() => props.members
  .filter(m => `${props.nameOf(m)} ${m.email || ''}`.toLowerCase().includes(search.value.toLowerCase()))
  .sort((a, b) => props.nameOf(a).localeCompare(props.nameOf(b))))
watch(() => props.members.length, () => { if (!selectedId.value && props.members.length) selectedId.value = String(props.members.find(m => String(m._id) !== props.meId)?._id || props.members[0]._id) }, { immediate: true })
const selected = computed(() => props.members.find(m => String(m._id) === selectedId.value) || null)
const selRole = computed(() => selected.value ? props.roleOf(selected.value) : 'member')
const isAdminSel = computed(() => selRole.value === 'admin')
const isMe = computed(() => selectedId.value === props.meId)
const eff = computed(() => selected.value ? effective(selRole.value, access.users[selectedId.value]) : new Set())
const customCount = computed(() => (access.users[selectedId.value]?.allow?.length || 0) + (access.users[selectedId.value]?.deny?.length || 0))

const source = key => {
  if (isAdminSel.value) return 'Admin'
  const st = userState(selectedId.value, key)
  return st === 'allow' ? 'Allowed for this person' : st === 'deny' ? 'Blocked for this person' : `From the ${selRole.value} role`
}
const STATES = [
  { value: 'inherit', label: 'Default' },
  { value: 'allow', label: 'Allow' },
  { value: 'deny', label: 'Block' }
]
const roleLabel = r => ROLES.find(x => x.value === r)?.label || r
const when = iso => iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
const toggleLabel = computed(() => access.enabled ? 'On' : 'Off')
</script>

<template>
  <section class="ac">
    <div class="panel glass-panel ac-hero">
      <div class="ac-hero-text">
        <div class="eyebrow">ADMIN ONLY</div>
        <h2><Lock :size="20" /> Access control</h2>
        <p>Choose each person's role and exactly what they can see and do. Turn it off at any time to go back to the standard rules.</p>
      </div>
      <button type="button" class="ac-switch" :class="{ on: access.enabled }" role="switch" :aria-checked="access.enabled" :disabled="!access.available || access.busy" @click="setEnabled(!access.enabled)">
        <span class="ac-knob"></span>
        <span class="ac-switch-label">{{ toggleLabel }}</span>
      </button>
    </div>

    <div v-if="!access.available" class="panel glass-panel ac-notice" role="status">
      <strong>The backend does not support access control yet.</strong>
      <span>Ask the backend team to implement <code>BACKEND_ACCESS_CONTROL.md</code>. Until then this screen is read-only and nothing is enforced.</span>
    </div>

    <template v-else>
      <div v-if="!access.enabled" class="panel glass-panel ac-notice off" role="status">
        <strong>Access control is OFF.</strong>
        <span>Everyone follows the standard rules. You can still prepare roles and permissions below; they are saved but not enforced until you switch it on.</span>
      </div>
      <div v-else class="panel glass-panel ac-notice on" role="status">
        <strong>Access control is ON.</strong>
        <span>Every screen and action below is checked against each person's role and permissions.</span>
      </div>

      <div v-if="access.previewAs" class="panel glass-panel ac-notice preview" role="status">
        <Eye :size="16" /> <span>Previewing the app as <strong>{{ nameOf(members.find(m => String(m._id) === access.previewAs) || {}) }}</strong>. Menus and buttons are hidden exactly as they will be for that person.</span>
        <button type="button" class="secondary-btn tiny-btn" style="width:auto" @click="emit('stop-preview')">Exit preview</button>
      </div>

      <div class="ac-tabs" role="tablist">
        <button v-for="t in [['people', 'People'], ['roles', 'Role permissions'], ['history', 'History']]" :key="t[0]" type="button" role="tab" :aria-selected="tab === t[0]" :class="{ active: tab === t[0] }" @click="tab = t[0]">{{ t[1] }}</button>
      </div>

      <!-- PEOPLE -->
      <div v-if="tab === 'people'" class="ac-people">
        <aside class="panel glass-panel ac-list">
          <input v-model="search" class="ac-search" placeholder="Search people…" aria-label="Search people" />
          <div class="ac-rows">
            <button v-for="m in list" :key="m._id" type="button" class="ac-row" :class="{ active: String(m._id) === selectedId }" @click="selectedId = String(m._id)">
              <span class="mini-avatar">{{ nameOf(m).split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() }}</span>
              <span class="ac-row-main"><strong>{{ nameOf(m) }}</strong><small>{{ m.email }}</small></span>
              <span class="role-badge" :class="'r-' + roleOf(m)">{{ roleLabel(roleOf(m)) }}</span>
              <span v-if="hasOverrides(String(m._id))" class="ac-custom" title="Has custom permissions">●</span>
            </button>
            <span v-if="!list.length" class="td-hint">Nobody matches.</span>
          </div>
        </aside>

        <div v-if="selected" class="panel glass-panel ac-editor">
          <header class="ac-editor-head">
            <div class="avatar big-avatar">{{ nameOf(selected).split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() }}</div>
            <div class="ac-editor-id">
              <h3>{{ nameOf(selected) }} <small v-if="isMe">(you)</small></h3>
              <span>{{ selected.email }}</span>
            </div>
            <button type="button" class="secondary-btn" :disabled="isAdminSel || !access.enabled" :title="access.enabled ? '' : 'Turn access control on to preview'" @click="emit('preview', selected)"><Eye :size="15" /> Preview as this person</button>
          </header>

          <div class="ac-block">
            <div class="eyebrow">ROLE</div>
            <div class="role-picker" role="radiogroup" aria-label="Role">
              <button v-for="r in ROLES" :key="r.value" type="button" role="radio" class="td-status-opt role-opt" :class="{ active: selRole === r.value }" :aria-checked="selRole === r.value" :disabled="busyRole || isMe" @click="emit('set-role', selected, r.value)">{{ r.value === 'viewer' ? 'Viewer (read-only)' : r.label }}</button>
            </div>
            <small class="td-hint">{{ isMe ? 'You cannot change your own role.' : 'Admin has full control · Member works inside their teams · Viewer can only read.' }}</small>
          </div>

          <div class="ac-block">
            <div class="ac-summary">
              <span><strong>{{ eff.size }}</strong> of {{ ALL_PERMISSIONS.length }} permissions allowed</span>
              <span v-if="customCount" class="ac-custom-pill">{{ customCount }} custom</span>
              <span style="flex:1"></span>
              <button v-if="customCount" type="button" class="secondary-btn tiny-btn" style="width:auto" @click="resetUser(selectedId)"><RotateCcw :size="13" /> Clear custom permissions</button>
            </div>
            <small v-if="isAdminSel" class="td-hint">Admins always have every permission and cannot be restricted.</small>
          </div>

          <div v-for="g in PERMISSION_GROUPS" :key="g.id" class="ac-block">
            <div class="eyebrow">{{ g.label.toUpperCase() }}</div>
            <div v-for="p in g.items" :key="p.key" class="ac-perm" :class="{ blocked: !eff.has(p.key) }">
              <div class="ac-perm-main">
                <span class="ac-perm-icon" :class="eff.has(p.key) ? 'ok' : 'no'" aria-hidden="true"><Check v-if="eff.has(p.key)" :size="13" /><X v-else :size="13" /></span>
                <div>
                  <strong>{{ p.label }}</strong>
                  <small>{{ p.hint ? p.hint + ' · ' : '' }}{{ source(p.key) }}</small>
                </div>
              </div>
              <div class="ac-tri" role="radiogroup" :aria-label="p.label">
                <button v-for="s in STATES" :key="s.value" type="button" role="radio" :aria-checked="userState(selectedId, p.key) === s.value" :class="[s.value, { active: userState(selectedId, p.key) === s.value }]" :disabled="isAdminSel" @click="setUserOverride(selectedId, p.key, s.value)">{{ s.label }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ROLE PRESETS -->
      <div v-else-if="tab === 'roles'" class="panel glass-panel ac-matrix">
        <div class="ac-matrix-head">
          <div>
            <h3>What each role can do</h3>
            <p>These are the defaults. A person can still get extra permissions or lose some on the People tab.</p>
          </div>
          <button type="button" class="secondary-btn tiny-btn" style="width:auto" @click="resetPresets"><RotateCcw :size="13" /> Restore defaults</button>
        </div>
        <table class="ac-table">
          <thead><tr><th>Permission</th><th v-for="r in ROLES" :key="r.value">{{ r.label }}</th></tr></thead>
          <tbody>
            <template v-for="g in PERMISSION_GROUPS" :key="g.id">
              <tr class="ac-group"><td :colspan="ROLES.length + 1">{{ g.label }}</td></tr>
              <tr v-for="p in g.items" :key="p.key">
                <td><strong>{{ p.label }}</strong><small v-if="p.hint">{{ p.hint }}</small></td>
                <td v-for="r in ROLES" :key="r.value" class="ac-cell">
                  <input type="checkbox" :checked="r.value === 'admin' || access.presets[r.value]?.includes(p.key)" :disabled="r.value === 'admin'" :aria-label="`${r.label}: ${p.label}`" @change="setPreset(r.value, p.key, $event.target.checked)" />
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- HISTORY -->
      <div v-else class="panel glass-panel ac-history">
        <h3>Recent changes</h3>
        <div v-for="h in access.history" :key="h.id" class="act-row-sm"><strong>{{ h.actor }}</strong> <span>{{ h.text }}</span> <small>{{ when(h.at) }}</small></div>
        <span v-if="!access.history.length" class="td-hint">No changes yet.</span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.ac { display: flex; flex-direction: column; gap: 14px; }
.ac-hero { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 22px 26px; }
.ac-hero h2 { display: flex; align-items: center; gap: 10px; margin: 4px 0 6px; font-family: 'Space Grotesk', sans-serif; }
.ac-hero p { margin: 0; color: var(--text-muted); max-width: 60ch; font-size: 13.5px; }
.ac-switch { display: inline-flex; align-items: center; gap: 12px; padding: 6px 16px 6px 6px; border-radius: 999px; border: 1px solid var(--glass-border); background: var(--glass-panel); color: var(--text); cursor: pointer; font-weight: 700; min-width: 112px; }
.ac-switch:disabled { opacity: .5; cursor: not-allowed; }
.ac-knob { width: 34px; height: 22px; border-radius: 999px; background: rgba(148, 163, 184, .35); position: relative; transition: background .2s; flex: none; }
.ac-knob::after { content: ''; position: absolute; top: 3px; inset-inline-start: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .2s; }
.ac-switch.on .ac-knob { background: var(--accent-emerald); }
.ac-switch.on .ac-knob::after { transform: translateX(12px); }
[dir='rtl'] .ac-switch.on .ac-knob::after { transform: translateX(-12px); }
.ac-notice { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 18px; font-size: 13px; }
.ac-notice strong { white-space: nowrap; }
.ac-notice.off { border-color: rgba(251, 191, 36, .45); }
.ac-notice.on { border-color: rgba(52, 211, 153, .45); }
.ac-notice.preview { border-color: rgba(139, 92, 246, .55); }
.ac-notice code { padding: 1px 6px; border-radius: 6px; background: var(--glass-border); }
.ac-tabs { display: flex; gap: 6px; padding: 4px; border-radius: 999px; background: var(--glass-panel); border: 1px solid var(--glass-border); align-self: flex-start; }
.ac-tabs button { border: 0; background: none; color: var(--text-muted); padding: 7px 16px; border-radius: 999px; cursor: pointer; font-weight: 600; }
.ac-tabs button.active { background: linear-gradient(135deg, rgba(139, 92, 246, .35), rgba(99, 102, 241, .25)); color: var(--text); }
.ac-people { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 14px; align-items: start; }
.ac-list { padding: 14px; display: flex; flex-direction: column; gap: 10px; position: sticky; top: 76px; max-height: calc(100vh - 110px); }
.ac-search { width: 100%; }
.ac-rows { display: flex; flex-direction: column; gap: 4px; overflow: auto; }
.ac-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; border: 1px solid transparent; background: none; color: inherit; cursor: pointer; text-align: start; }
.ac-row:hover { background: var(--glass-border); }
.ac-row.active { border-color: var(--primary); background: rgba(139, 92, 246, .14); }
.ac-row-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.ac-row-main strong, .ac-row-main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ac-row-main small { color: var(--text-muted); font-size: 11.5px; }
.r-admin { color: var(--accent-rose); }
.r-viewer { color: var(--accent-cyan); }
.ac-custom { color: var(--primary); font-size: 10px; }
.ac-editor { padding: 20px 22px; display: flex; flex-direction: column; gap: 16px; }
.ac-editor-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.ac-editor-id { flex: 1; min-width: 160px; }
.ac-editor-id h3 { margin: 0; font-family: 'Space Grotesk', sans-serif; }
.ac-editor-id span { color: var(--text-muted); font-size: 13px; }
.ac-block { display: flex; flex-direction: column; gap: 8px; padding-top: 14px; border-top: 1px solid var(--glass-border); }
.ac-summary { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 13px; }
.ac-custom-pill { padding: 2px 10px; border-radius: 999px; background: rgba(139, 92, 246, .2); color: var(--primary); font-size: 11.5px; font-weight: 700; }
.ac-perm { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 8px 4px; flex-wrap: wrap; }
.ac-perm-main { display: flex; align-items: center; gap: 12px; min-width: 220px; flex: 1; }
.ac-perm-main strong { display: block; font-size: 13.5px; }
.ac-perm-main small { color: var(--text-muted); font-size: 11.5px; }
.ac-perm.blocked .ac-perm-main strong { color: var(--text-muted); text-decoration: line-through; text-decoration-color: rgba(248, 113, 113, .6); }
.ac-perm-icon { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; flex: none; }
.ac-perm-icon.ok { background: rgba(52, 211, 153, .18); color: var(--accent-emerald); }
.ac-perm-icon.no { background: rgba(248, 113, 113, .16); color: var(--accent-rose); }
.ac-tri { display: inline-flex; padding: 3px; border-radius: 999px; background: var(--glass-panel); border: 1px solid var(--glass-border); }
.ac-tri button { border: 0; background: none; color: var(--text-muted); padding: 5px 13px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; }
.ac-tri button:disabled { opacity: .45; cursor: not-allowed; }
.ac-tri button.active.inherit { background: var(--glass-border); color: var(--text); }
.ac-tri button.active.allow { background: rgba(52, 211, 153, .22); color: var(--accent-emerald); }
.ac-tri button.active.deny { background: rgba(248, 113, 113, .22); color: var(--accent-rose); }
.ac-matrix, .ac-history { padding: 20px 22px; overflow-x: auto; }
.ac-matrix-head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
.ac-matrix-head h3 { margin: 0 0 4px; font-family: 'Space Grotesk', sans-serif; }
.ac-matrix-head p { margin: 0; color: var(--text-muted); font-size: 13px; }
.ac-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
.ac-table th { text-align: center; color: var(--text-muted); font-weight: 600; padding: 8px; }
.ac-table th:first-child { text-align: start; }
.ac-table td { padding: 9px 8px; border-top: 1px solid var(--glass-border); }
.ac-table td small { display: block; color: var(--text-muted); font-size: 11.5px; }
.ac-group td { background: var(--glass-panel); font-weight: 700; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); }
.ac-cell { text-align: center; }
.ac-cell input { width: 18px; height: 18px; accent-color: var(--primary); }
.ac-history h3 { margin: 0 0 10px; font-family: 'Space Grotesk', sans-serif; }
@media (max-width: 900px) { .ac-people { grid-template-columns: minmax(0, 1fr); } .ac-list { position: static; max-height: 320px; } .ac-hero { flex-direction: column; align-items: flex-start; } }
</style>
