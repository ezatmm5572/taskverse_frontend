import { reactive } from 'vue'

// Access control: roles (admin / member / viewer) -> permission presets, plus per-person overrides.
//   effective = (role preset + person "allow") - person "deny"      (admin always has everything)
// Demo Mode keeps the configuration in localStorage. With a real backend the server is the source of truth
// (see BACKEND_ACCESS_CONTROL.md): GET /access/me tells every user what they may do, admins edit via /access/*.
// The UI hides / disables what a person may not do; the SERVER must enforce the same keys on every route.

export const PERMISSION_GROUPS = [
  { id: 'see', label: 'What they can see', items: [
    { key: 'view.overview', label: 'Overview page', hint: 'Home screen with stats and activity' },
    { key: 'view.tasks', label: 'Tasks page', hint: 'List, board and calendar of tasks' },
    { key: 'view.teams', label: 'Teams page', hint: 'Teams and their members' },
    { key: 'view.members', label: 'Members page', hint: 'Directory of people and their profiles' },
    { key: 'view.assignments', label: 'My assignments', hint: 'Tasks assigned to them' },
    { key: 'view.reports', label: 'Dashboards & reports', hint: 'Charts, burn-down, workload and time reports' }
  ] },
  { id: 'tasks', label: 'Tasks', items: [
    { key: 'task.create', label: 'Create tasks', hint: 'New tasks, from templates too' },
    { key: 'task.edit', label: 'Edit task details', hint: 'Title, dates, priority, tags, subtasks, schedule' },
    { key: 'task.delete', label: 'Delete tasks', hint: 'Single and bulk delete' },
    { key: 'task.assign', label: 'Assign people', hint: 'Add or remove assignees' },
    { key: 'task.status', label: 'Change status', hint: 'Move tasks between To do / In progress / Done' },
    { key: 'task.comment', label: 'Comment', hint: 'Write comments and @mention people' },
    { key: 'task.attach', label: 'Attach files', hint: 'Upload attachments' },
    { key: 'task.logTime', label: 'Log time', hint: 'Timer and manual time entries' },
    { key: 'task.share', label: 'Share links', hint: 'Create public read-only links' }
  ] },
  { id: 'people', label: 'Teams & people', items: [
    { key: 'team.create', label: 'Create teams', hint: '' },
    { key: 'team.manage', label: 'Manage team members & roles', hint: 'Add, remove, change roles inside a team' },
    { key: 'team.delete', label: 'Delete teams', hint: '' },
    { key: 'member.invite', label: 'Invite members', hint: 'Create new accounts' },
    { key: 'member.edit', label: 'Edit members', hint: 'Rename, deactivate, reset password, delete, change roles' }
  ] },
  { id: 'data', label: 'Data', items: [
    { key: 'report.export', label: 'Export data', hint: 'CSV and PDF exports' }
  ] }
]
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key))
export const PERMISSION_LABEL = Object.fromEntries(PERMISSION_GROUPS.flatMap(g => g.items.map(i => [i.key, i.label])))

export const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' }
]

export const DEFAULT_PRESETS = () => ({
  admin: [...ALL_PERMISSIONS],
  member: ['view.overview', 'view.tasks', 'view.teams', 'view.members', 'view.assignments', 'view.reports', 'task.create', 'task.edit', 'task.status', 'task.comment', 'task.attach', 'task.logTime', 'task.share', 'report.export'],
  viewer: ['view.overview', 'view.tasks', 'view.teams', 'view.members', 'view.assignments']
})

const KEY = 'taskverse-access'
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
const saved = read()

export const access = reactive({
  enabled: !!saved?.enabled,
  available: true, // false when the backend has no /access routes yet
  loaded: false,
  busy: false,
  presets: { ...DEFAULT_PRESETS(), ...(saved?.presets || {}), admin: [...ALL_PERMISSIONS] },
  users: saved?.users || {}, // { [memberId]: { allow: [], deny: [] } }
  me: { role: 'admin', permissions: null }, // server-computed for the signed-in user (real mode)
  previewAs: '', // admin "view as" (UI only)
  history: saved?.history || []
})

let ctx = { api: null, roleOf: () => 'member', myId: () => '', actor: () => 'Admin', onError: null, nameOf: id => id }
export function initAccess(c) { ctx = { ...ctx, ...c } }

const live = () => !!ctx.api
const persist = () => {
  if (live()) return
  try { localStorage.setItem(KEY, JSON.stringify({ enabled: access.enabled, presets: access.presets, users: access.users, history: access.history })) } catch { /* ignore */ }
}
const note = text => {
  access.history.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: new Date().toISOString(), actor: ctx.actor(), text })
  if (access.history.length > 100) access.history.length = 100
}
const fail = e => { ctx.onError?.(e) }

export function effective(role, cfg) {
  if (role === 'admin') return new Set(ALL_PERMISSIONS)
  const set = new Set(access.presets[role] || [])
  for (const k of cfg?.allow || []) set.add(k)
  for (const k of cfg?.deny || []) set.delete(k)
  return set
}

export function userState(memberId, key) {
  const c = access.users[memberId]
  return c?.deny?.includes(key) ? 'deny' : c?.allow?.includes(key) ? 'allow' : 'inherit'
}
export const hasOverrides = id => !!(access.users[id]?.allow?.length || access.users[id]?.deny?.length)

// Can the person currently looking at the screen do `key`?  (Feature off => nothing extra is restricted.)
export function can(key) {
  if (!access.enabled) return true
  if (access.previewAs) return effective(ctx.roleOf(access.previewAs), access.users[access.previewAs]).has(key)
  if (access.me.role === 'admin') return true
  if (Array.isArray(access.me.permissions)) return access.me.permissions.includes(key)
  const id = ctx.myId()
  return effective(ctx.roleOf(id), access.users[id]).has(key)
}

// ---- loading (real backend) ----
export async function loadAccess(isAdmin) {
  if (!live()) { access.loaded = true; return }
  try {
    const me = (await ctx.api.accessMe())?.data || {}
    access.available = true
    access.enabled = !!me.enabled
    access.me = { role: me.role || 'member', permissions: Array.isArray(me.permissions) ? me.permissions : null }
  } catch (e) {
    if (e.status === 404 || e.status === 501) { access.available = false; access.enabled = false; access.loaded = true; return }
    return fail(e)
  }
  if (isAdmin) {
    try {
      const cfg = (await ctx.api.accessConfig())?.data || {}
      if (cfg.rolePresets) access.presets = { ...DEFAULT_PRESETS(), ...cfg.rolePresets, admin: [...ALL_PERMISSIONS] }
      access.enabled = cfg.enabled ?? access.enabled
      const users = (await ctx.api.accessUsers())?.data
      const map = {}
      for (const u of Array.isArray(users) ? users : users?.items || []) map[String(u.memberId || u._id)] = { allow: u.allow || [], deny: u.deny || [] }
      access.users = map
      access.history = ((await ctx.api.accessAudit().catch(() => null))?.data || []).map(h => ({ id: h._id || h.id, at: h.createdAt || h.at, actor: h.actorName || h.actor?.fname || '', text: h.text }))
    } catch (e) { fail(e) }
  }
  access.loaded = true
}

export function resetAccess() {
  access.enabled = false; access.available = true; access.loaded = false; access.previewAs = ''
  access.me = { role: 'admin', permissions: null }
}

// ---- admin edits (optimistic; the server is told in real mode, reverted on failure) ----
async function push(call, rollback) {
  if (!live()) return
  access.busy = true
  try { await call() } catch (e) { rollback(); fail(e) } finally { access.busy = false }
}

export function setEnabled(on) {
  const prev = access.enabled
  access.enabled = !!on
  if (!on) access.previewAs = ''
  note(on ? 'turned access control ON' : 'turned access control OFF')
  persist()
  return push(() => ctx.api.saveAccessConfig({ enabled: !!on }), () => { access.enabled = prev })
}

export function setPreset(role, key, on) {
  if (role === 'admin') return
  const prev = [...(access.presets[role] || [])]
  const set = new Set(prev)
  on ? set.add(key) : set.delete(key)
  access.presets[role] = ALL_PERMISSIONS.filter(k => set.has(k))
  note(`${on ? 'granted' : 'removed'} "${PERMISSION_LABEL[key]}" ${on ? 'to' : 'from'} the ${role} role`)
  persist()
  return push(() => ctx.api.saveAccessConfig({ rolePresets: { member: access.presets.member, viewer: access.presets.viewer } }), () => { access.presets[role] = prev })
}

export function resetPresets() {
  const prev = JSON.parse(JSON.stringify(access.presets))
  access.presets = DEFAULT_PRESETS()
  note('restored the default role permissions')
  persist()
  return push(() => ctx.api.saveAccessConfig({ rolePresets: { member: access.presets.member, viewer: access.presets.viewer } }), () => { access.presets = prev })
}

// state: 'inherit' | 'allow' | 'deny'
export function setUserOverride(memberId, key, state) {
  const prev = access.users[memberId] ? { allow: [...access.users[memberId].allow], deny: [...access.users[memberId].deny] } : null
  const cur = access.users[memberId] ||= { allow: [], deny: [] }
  cur.allow = cur.allow.filter(k => k !== key)
  cur.deny = cur.deny.filter(k => k !== key)
  if (state === 'allow') cur.allow.push(key)
  if (state === 'deny') cur.deny.push(key)
  if (!cur.allow.length && !cur.deny.length) delete access.users[memberId]
  note(`${state === 'inherit' ? 'reset' : state === 'allow' ? 'allowed' : 'blocked'} "${PERMISSION_LABEL[key]}" for ${ctx.nameOf(memberId)}`)
  persist()
  const now = access.users[memberId] || { allow: [], deny: [] }
  return push(() => ctx.api.saveAccessUser(memberId, { allow: now.allow, deny: now.deny }), () => { prev ? access.users[memberId] = prev : delete access.users[memberId] })
}

export function resetUser(memberId) {
  const prev = access.users[memberId]
  if (!prev) return
  delete access.users[memberId]
  note(`cleared all custom permissions for ${ctx.nameOf(memberId)}`)
  persist()
  return push(() => ctx.api.saveAccessUser(memberId, { allow: [], deny: [] }), () => { access.users[memberId] = prev })
}

export function logAccess(text) { note(text); persist() }
