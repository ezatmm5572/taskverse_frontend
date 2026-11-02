import { reactive } from 'vue'

// Client-side store for task extras the backend has no endpoints for yet
// (priority, tags, subtasks, comments, attachments) plus the activity log.
// Persisted per browser in localStorage. See BACKEND_API_SPEC.md for the server-side contract
// that would replace this module so the data is shared between users.
const KEY = 'taskverse-extras'
const ACTIVITY_KEY = 'taskverse-activity'
const MAX_FILE = 1024 * 1024 // 1 MB per attachment in Demo Mode (localStorage budget)
const MAX_SERVER_FILE = 10 * 1024 * 1024 // backend limit

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
]
export const PRIORITY_RANK = { urgent: 4, high: 3, medium: 2, low: 1, '': 0 }

export const RECURRENCES = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
]
export const REMINDERS = [
  { value: 0, label: 'Off' }, { value: 1, label: '1 day before' }, { value: 2, label: '2 days before' },
  { value: 3, label: '3 days before' }, { value: 7, label: '1 week before' }
]

const blank = () => ({ priority: '', tags: [], subtasks: [], comments: [], attachments: [], recurrence: 'none', remindBefore: 2, estimateMin: 0, timeEntries: [], timer: null, completedAt: '' })
const EMPTY = Object.freeze(blank())

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback } catch { return fallback }
}
const state = reactive(read(KEY, {}))
const log = reactive(read(ACTIVITY_KEY, []))

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    throw new Error('Browser storage is full. Remove some attachments and try again.')
  }
}
const save = () => { if (!sync.api) write(KEY, state) }
const entry = id => {
  const e = (state[id] ||= blank())
  e.tags ||= []; e.subtasks ||= []; e.recurrence ||= 'none'; if (e.remindBefore == null) e.remindBefore = 2
  e.timeEntries ||= []; e.estimateMin ||= 0; e.timer ||= null; e.completedAt ||= ''
  return e
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

// Stable colour per tag name.
export function tagColor(tag) {
  let h = 0
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) % 360
  return { color: `hsl(${h} 80% 72%)`, background: `hsl(${h} 70% 55% / 0.16)`, borderColor: `hsl(${h} 70% 60% / 0.4)` }
}

// --- Server sync -------------------------------------------------------------------------------
// In Demo Mode everything lives in localStorage. With a real backend the view calls enableSync(): the same mutators
// then update the UI optimistically AND call the API; on failure the task is re-fetched so the UI never drifts.
export const sync = { api: null, onError: null, refresh: null }
export function enableSync({ api, onError, refresh }) {
  sync.api = api; sync.onError = onError; sync.refresh = refresh
  replace(state, {}) // never mix demo / cached data with server data
}
export function disableSync() {
  if (!sync.api) return
  sync.api = null; sync.onError = null; sync.refresh = null
  replace(state, read(KEY, {}))
}
const live = () => !!sync.api
const waits = new Map() // temp id -> Promise<server id>
const sid = id => waits.get(id) || Promise.resolve(id)
const person = p => (p && typeof p === 'object') ? { id: p._id || p.id, name: `${p.fname || ''} ${p.lname || ''}`.trim() || p.email || '' } : { id: p || '', name: '' }
// Runs a server call; on any failure reports it and re-syncs the task.
function remote(taskId, call) {
  if (!live()) return Promise.resolve()
  return Promise.resolve().then(call).catch(e => { sync.onError?.(e); return sync.refresh?.(taskId) })
}
const pick = (res, ...keys) => { const d = res?.data; for (const k of keys) if (d?.[k]) return d[k]; return d }

const mapSub = s => ({ id: s._id || s.id, text: s.text, done: !!s.done })
const mapComment = c => { const a = person(c.author || c.authorId); return { id: c._id || c.id, authorId: a.id, authorName: c.authorName || a.name, text: c.text, at: c.createdAt || c.at } }
const mapAttachment = a => { const u = person(a.uploadedBy || a.author); return { id: a._id || a.id, name: a.name, size: a.size || 0, type: a.mimeType || a.type || '', dataUrl: a.url || a.dataUrl || '', authorId: u.id, authorName: a.authorName || u.name, at: a.createdAt || a.at } }
const mapTime = x => { const a = person(x.author || x.authorId); return { id: x._id || x.id, authorId: a.id, authorName: x.authorName || a.name, minutes: x.minutes, note: x.note || '', at: x.at || x.createdAt } }
// Swap a temporary client id for the server id once the call returns.
function adopt(list, tempId, real) { const it = list.find(x => x.id === tempId); if (it && real) it.id = real; waits.delete(tempId); return real }

export const extras = {
  get: id => state[id] || EMPTY,
  all: () => state,
  allTags: () => [...new Set(Object.values(state).flatMap(e => e.tags || []))].sort(),

  // Copy server fields (list or detail response) into the local view-model.
  hydrate(t) {
    if (!t?._id) return
    const e = entry(t._id)
    if (t.priority !== undefined) e.priority = t.priority || ''
    if (Array.isArray(t.tags)) e.tags = [...t.tags]
    if (t.recurrence) e.recurrence = t.recurrence
    if (t.remindBefore != null) e.remindBefore = Number(t.remindBefore)
    if (t.estimateMin != null) e.estimateMin = Number(t.estimateMin) || 0
    if (t.completedAt !== undefined) e.completedAt = t.completedAt || ''
    if (Array.isArray(t.subtasks)) e.subtasks = t.subtasks.map(mapSub)
    if (Array.isArray(t.comments)) e.comments = t.comments.map(mapComment)
    if (Array.isArray(t.attachments)) e.attachments = t.attachments.map(mapAttachment)
    if (Array.isArray(t.timeEntries)) e.timeEntries = t.timeEntries.map(mapTime)
  },

  setPriority(id, priority) { entry(id).priority = priority; save(); remote(id, () => sync.api.updateTask(id, { priority })) },
  setTags(id, tags) { entry(id).tags = tags; save(); remote(id, () => sync.api.updateTask(id, { tags })) },

  // --- Time tracking ---
  setEstimate(id, hours) { const m = Math.max(0, Math.round(Number(hours || 0) * 60)); entry(id).estimateMin = m; save(); remote(id, () => sync.api.updateTask(id, { estimateMin: m })) },
  addTime(id, author, minutes, note = '') {
    const e = { id: uid(), authorId: author.id, authorName: author.name, minutes: Math.max(1, Math.round(minutes)), note, at: new Date().toISOString() }
    entry(id).timeEntries.push(e)
    save()
    if (live()) {
      const p = remote(id, async () => adopt(entry(id).timeEntries, e.id, pick(await sync.api.addTime(id, { minutes: e.minutes, note: e.note || undefined, at: e.at }), 'entry', 'timeEntry')?._id))
      waits.set(e.id, p.then(() => e.id))
    }
  },
  removeTime(id, entryId) {
    const e = entry(id); e.timeEntries = e.timeEntries.filter(x => x.id !== entryId); save()
    remote(id, async () => sync.api.removeTime(id, await sid(entryId)))
  },
  startTimer(id, author) {
    const e = entry(id)
    if (e.timer) return
    e.timer = { startedAt: Date.now(), authorId: author.id, authorName: author.name }
    save()
  },
  stopTimer(id) {
    const e = entry(id)
    if (!e.timer) return 0
    const minutes = Math.max(1, Math.round((Date.now() - e.timer.startedAt) / 60000))
    const author = { id: e.timer.authorId, name: e.timer.authorName }
    e.timer = null
    extras.addTime(id, author, minutes, 'Timer')
    return minutes
  },
  logged: id => ((state[id]?.timeEntries) || []).reduce((n, x) => n + x.minutes, 0),
  setCompleted(id, iso) { entry(id).completedAt = iso; save() },

  setRecurrence(id, recurrence) { entry(id).recurrence = recurrence; save(); remote(id, () => sync.api.updateTask(id, { recurrence })) },
  setReminder(id, days) { entry(id).remindBefore = Number(days); save(); remote(id, () => sync.api.updateTask(id, { remindBefore: Number(days) })) },
  // Copy the reusable bits onto a freshly spawned recurring task (Demo Mode only: the server spawns its own).
  cloneForNext(fromId, toId) {
    if (live()) return
    const e = state[fromId]
    if (!e) return
    const n = entry(toId)
    Object.assign(n, { priority: e.priority, tags: [...e.tags], recurrence: e.recurrence, remindBefore: e.remindBefore, subtasks: e.subtasks.map(x => ({ ...x, id: uid(), done: false })) })
    save()
  },

  addSubtask(id, text) {
    const s = { id: uid(), text, done: false }
    entry(id).subtasks.push(s); save()
    if (live()) {
      const p = remote(id, async () => adopt(entry(id).subtasks, s.id, pick(await sync.api.addSubtask(id, text), 'subtask')?._id))
      waits.set(s.id, p.then(() => s.id))
    }
  },
  toggleSubtask(id, subId) {
    const s = entry(id).subtasks.find(x => x.id === subId)
    if (!s) return
    s.done = !s.done; save()
    remote(id, async () => sync.api.updateSubtask(id, await sid(subId), { done: s.done }))
  },
  removeSubtask(id, subId) { const e = entry(id); e.subtasks = e.subtasks.filter(x => x.id !== subId); save(); remote(id, async () => sync.api.removeSubtask(id, await sid(subId))) },
  progress(id) {
    const subs = (state[id]?.subtasks) || []
    return { done: subs.filter(s => s.done).length, total: subs.length }
  },

  addComment(id, author, text) {
    const c = { id: uid(), authorId: author.id, authorName: author.name, text, at: new Date().toISOString() }
    entry(id).comments.push(c); save()
    if (live()) {
      const p = remote(id, async () => adopt(entry(id).comments, c.id, pick(await sync.api.addComment(id, text), 'comment')?._id))
      waits.set(c.id, p.then(() => c.id))
    }
  },
  removeComment(id, commentId) {
    const e = entry(id)
    e.comments = e.comments.filter(c => c.id !== commentId); save()
    remote(id, async () => sync.api.removeComment(id, await sid(commentId)))
  },
  async addAttachment(id, file, author) {
    if (live()) {
      if (file.size > MAX_SERVER_FILE) throw new Error(`"${file.name}" is larger than 10 MB.`)
      const res = await sync.api.addAttachment(id, file)
      const d = res?.data
      const list = Array.isArray(d) ? d : Array.isArray(d?.attachments) ? d.attachments : [d?.attachment || d].filter(Boolean)
      entry(id).attachments.push(...list.map(mapAttachment))
      return
    }
    if (file.size > MAX_FILE) throw new Error(`"${file.name}" is larger than 1 MB.`)
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => reject(new Error('Could not read the file.'))
      r.readAsDataURL(file)
    })
    entry(id).attachments.push({ id: uid(), name: file.name, size: file.size, type: file.type, dataUrl, authorId: author.id, authorName: author.name, at: new Date().toISOString() })
    try { save() } catch (e) { entry(id).attachments.pop(); throw e }
  },
  removeAttachment(id, attId) {
    const e = entry(id)
    e.attachments = e.attachments.filter(a => a.id !== attId); save()
    remote(id, () => sync.api.removeAttachment(id, attId))
  }
}

// --- Activity log: who changed what and when ---
export const activity = log
export function logActivity({ actorName, text, taskId = '' }) {
  log.unshift({ id: uid(), at: new Date().toISOString(), actorName, text, taskId })
  if (log.length > 200) log.length = 200
  try { write(ACTIVITY_KEY, log) } catch { /* the log is best-effort */ }
}

// --- Team roles layered on top of the backend's admin/member: 'viewer' is read-only, 'editor' is the default member. ---
const ROLES_KEY = 'taskverse-team-roles'
const roles = reactive(read(ROLES_KEY, {}))
export const teamRoles = {
  get: (teamId, memberId) => roles[teamId]?.[memberId] || 'editor',
  set(teamId, memberId, role) {
    ;(roles[teamId] ||= {})[memberId] = role
    if (role === 'editor') delete roles[teamId][memberId]
    try { write(ROLES_KEY, roles) } catch { /* best-effort */ }
  }
}

// --- Time helpers ---
export const fmtMinutes = m => {
  m = Math.round(m || 0)
  const h = Math.floor(m / 60)
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

// --- Task templates ---
const TEMPLATES_KEY = 'taskverse-templates'
export const BUILTIN_TEMPLATES = [
  { id: 'tpl-onboarding', name: 'Employee onboarding', title: 'Onboard new hire', description: 'Get a new teammate productive in their first weeks.\n- Accounts and access\n- Intro meetings\n- First project', priority: 'high', tags: ['onboarding'], recurrence: 'none', durationDays: 14,
    subtasks: ['Create accounts and email', 'Prepare equipment', 'Schedule intro meetings', 'Share handbook and policies', 'Assign a buddy', '30-day check-in'] },
  { id: 'tpl-weekly', name: 'Weekly report', title: 'Weekly status report', description: 'Summarize progress, blockers and next steps for the week.', priority: 'medium', tags: ['report'], recurrence: 'weekly', durationDays: 4,
    subtasks: ['Collect updates from the team', 'Write the summary', 'Review blockers', 'Send to stakeholders'] },
  { id: 'tpl-bug', name: 'Bug triage', title: 'Triage incoming bugs', description: 'Review new bug reports, reproduce, prioritize and assign.', priority: 'high', tags: ['bug'], recurrence: 'daily', durationDays: 1,
    subtasks: ['Review new reports', 'Reproduce and confirm', 'Set severity', 'Assign an owner'] },
  { id: 'tpl-release', name: 'Release checklist', title: 'Release checklist', description: 'Everything to verify before shipping.', priority: 'urgent', tags: ['release'], recurrence: 'monthly', durationDays: 7,
    subtasks: ['Freeze scope', 'Run regression tests', 'Update changelog', 'Deploy to staging', 'Smoke test', 'Deploy to production', 'Announce the release'] },
  { id: 'tpl-content', name: 'Content publishing', title: 'Publish content piece', description: 'Plan, write, review and publish.', priority: 'medium', tags: ['content'], recurrence: 'weekly', durationDays: 6,
    subtasks: ['Outline', 'Draft', 'Review and edit', 'Design assets', 'Schedule and publish'] }
]
const customTemplates = reactive(read(TEMPLATES_KEY, []))
const persistTpl = () => { if (!sync.api) write(TEMPLATES_KEY, customTemplates) }
const mapTpl = x => ({ id: x._id || x.id, name: x.name, title: x.title || x.name, description: x.description || '', priority: x.priority || '', tags: x.tags || [], recurrence: x.recurrence || 'none', remindBefore: x.remindBefore, estimateMin: x.estimateMin, durationDays: x.durationDays || 7, subtasks: x.checklist || x.subtasks || [] })
export const templateStore = {
  custom: customTemplates,
  all: () => [...BUILTIN_TEMPLATES, ...customTemplates],
  async loadRemote() {
    if (!sync.api) return
    const res = await sync.api.templates()
    const list = Array.isArray(res?.data) ? res.data : res?.data?.items || []
    replace(customTemplates, list.map(mapTpl))
  },
  add(tpl) {
    const t = { ...tpl, id: 'tpl-' + uid() }
    customTemplates.push(t); persistTpl()
    if (sync.api) {
      sync.api.createTemplate({ name: t.name, scope: 'user', title: t.title, description: t.description, priority: t.priority || undefined, tags: t.tags, recurrence: t.recurrence, checklist: t.subtasks })
        .then(r => { if (r?.data?._id) t.id = r.data._id })
        .catch(e => { const i = customTemplates.indexOf(t); if (i >= 0) customTemplates.splice(i, 1); sync.onError?.(e) })
    }
  },
  remove(id) {
    const i = customTemplates.findIndex(x => x.id === id)
    if (i < 0) return
    const [gone] = customTemplates.splice(i, 1); persistTpl()
    if (sync.api) sync.api.deleteTemplate(id).catch(e => { customTemplates.splice(i, 0, gone); sync.onError?.(e) })
  },
  // Create-time helper: copy a template's reusable fields onto a task id.
  applyTo(taskId, tpl) {
    if (tpl.priority) extras.setPriority(taskId, tpl.priority)
    if (tpl.tags?.length) extras.setTags(taskId, [...tpl.tags])
    if (tpl.recurrence && tpl.recurrence !== 'none') extras.setRecurrence(taskId, tpl.recurrence)
    ;(tpl.subtasks || []).forEach(text => extras.addSubtask(taskId, text))
  }
}

// --- Keep several open tabs in sync (localStorage 'storage' events fire in the *other* tabs) ---
function replace(target, next) {
  if (Array.isArray(target)) target.splice(0, target.length, ...(next || []))
  else { Object.keys(target).forEach(k => delete target[k]); Object.assign(target, next || {}) }
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    try {
      const next = e.newValue ? JSON.parse(e.newValue) : null
      if (e.key === KEY) replace(state, next)
      else if (e.key === ACTIVITY_KEY) replace(log, next)
      else if (e.key === ROLES_KEY) replace(roles, next)
      else if (e.key === TEMPLATES_KEY) replace(customTemplates, next)
    } catch { /* ignore malformed data */ }
  })
}
