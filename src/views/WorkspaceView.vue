<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  Activity, ArrowRight, Bell, CalendarDays, Check, CheckCircle2,
  ChevronDown, ClipboardList, Command, Grid2X2, LayoutDashboard,
  ListTodo, LogOut, Menu, Moon, Plus, Search, Settings, ShieldCheck, Sun,
  Users, X, Zap, RefreshCw, UserRound, KeyRound, Mail, Trash2, Pencil, UserPlus,
  Sparkles, CheckSquare, Clock, Filter, AlertCircle, Laptop, ArrowLeft,
  Paperclip, MessageSquare, Flag, Send, Download, BellRing, Languages, Tag, ListChecks, List, Repeat, FileText, Eye, Ellipsis, Undo2, Play, Square, Timer, Link2, LayoutDashboard as DashIcon
} from 'lucide-vue-next'
import AuthPanel from '../components/AuthPanel.vue'
import { vModalA11y } from '../services/modalA11y.js'
import { api, asList, clearSession, setSession, API_BASE_URL } from '../services/api.js'
import { startRealtime, stopRealtime, rtStatus } from '../services/realtime.js'
import { demoUser, demoTeams, demoMembers, demoTasks, demoAssignments } from '../services/demoData.js'
import AppToast from '../components/AppToast.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import AppFooter from '../components/AppFooter.vue'
import MemberPicker from '../components/MemberPicker.vue'
import { extras, PRIORITIES, PRIORITY_RANK, RECURRENCES, REMINDERS, teamRoles, tagColor, activity, logActivity, templateStore, fmtMinutes, enableSync, disableSync } from '../services/extras.js'
import { renderRich, stripRich, handleOf, mentionsOf } from '../services/richtext.js'
import { downloadCSV, printReport } from '../services/exporter.js'
import RichText from '../components/RichText.vue'
import TeamDashboard from '../components/TeamDashboard.vue'
import TimeCard from '../components/TimeCard.vue'
import MentionInput from '../components/MentionInput.vue'
import { t, lang, toggleLang } from '../services/i18n.js'
import KanbanBoard from '../components/KanbanBoard.vue'
import CalendarView from '../components/CalendarView.vue'
import OverviewInsights from '../components/OverviewInsights.vue'

const route = useRoute()
const router = useRouter()

// --- State ---
const token = ref(localStorage.getItem('taskverse-token') || '')
const currentUser = ref(JSON.parse(localStorage.getItem('taskverse-user') || 'null'))
const isDemoMode = ref(localStorage.getItem('taskverse-demo') === 'true')
const authMode = ref('signin')
const loading = ref(false)
const busy = ref(false)
const toast = ref('')
const error = ref('')
const activeNav = ref('Overview')
const search = ref('')
const taskFilter = ref('all') // 'all', 'inProgress', 'completed', 'blocked'
const mobileMenu = ref(false)

// Collections
const tasks = ref([])
const teams = ref([])
const members = ref([])
const assignments = ref([])

// Forms
const authForm = ref({ fname: '', lname: '', email: '', password: '', confirmPassword: '', gender: 'male', otp: '', idToken: '' })
const resetForm = ref({ email: '', otp: '', password: '', confirmPassword: '' })
const taskForm = ref({
  title: '',
  description: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  teamId: ''
})
const teamName = ref('')
const teamEdit = ref({ teamId: '', name: '' })
const addTeamMemberForm = ref({ teamId: '', memberIds: [], role: 'teamMember' })
const teamRemovePick = ref([])
const createAssignees = ref([])
const taskTeamFilter = ref('all')
const memberForm = ref({ fname: '', lname: '', email: '', password: '', confirmPassword: '', gender: 'male' })
const assignmentForm = ref({ taskId: '', memberIds: [] })
const passwordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })

// Modal visibility
const showTaskModal = ref(false)
const showTaskDetail = ref(false)
const detailTaskId = ref('')
const detailForm = ref({ title: '', description: '', startDate: '', endDate: '', teamId: '' })
const detailStatus = ref('inProgress')
const showTeamModal = ref(false)
const showMemberModal = ref(false)
const showAssignModal = ref(false)
const taskViewMode = ref('list') // 'list' | 'board' | 'calendar'
const taskSort = ref('newest')
const taskTagFilter = ref('all')
const selectedIds = ref([])
const newTag = ref('')
const newSubtask = ref('')
const showMore = ref(false)
const undoToast = shallowRef(null)
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
const setOnline = () => { online.value = navigator.onLine; if (online.value && token.value && !isDemoMode.value) silentReload(['tasks', 'teams', 'members', 'assignments']) }
const pendingTemplate = ref(null)
const dashTeam = ref('all')
const timeInput = ref('')
const nowTs = ref(Date.now())
const showMemberDetail = ref(false)
const detailMemberId = ref('')
const showNotifs = ref(false)
const newComment = ref('')
const fileInput = ref(null)
const readNotifs = ref(new Set((() => { try { return JSON.parse(localStorage.getItem('taskverse-read-notifs') || '[]') } catch { return [] } })()))
const showTeamDetail = ref(false)
const detailTeamId = ref('')
const detailPick = ref([])
const showPasswordModal = ref(false)

// Navigation items
const navItems = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Tasks', icon: ListTodo },
  { name: 'Teams', icon: Grid2X2 },
  { name: 'Members', icon: Users },
  { name: 'My assignments', icon: ClipboardList },
  { name: 'Profile & security', icon: ShieldCheck }
]

// --- Computed ---
const fullName = computed(() => currentUser.value ? `${currentUser.value.fname || ''} ${currentUser.value.lname || ''}`.trim() : 'Workspace')
const initials = name => (name || 'TF').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase()

const taskStatus = task => {
  const status = task.myAssignment?.status || task.status || ''
  if (status === 'complete' || status === 'completed') return 'Completed'
  if (status === 'fail' || status === 'failed') return 'Blocked'
  if (status === 'inProgress' || status === 'in-progress') return 'In progress'
  return 'To do' // 'toDo' / 'to-do' / ''
}

const myId = computed(() => String(currentUser.value?._id || currentUser.value?.id || ''))
const isAdmin = computed(() => isDemoMode.value || currentUser.value?.role === 'admin')
const teamAdminIds = team => team?.teamAdims || team?.teamAdmins || []

// The backend returns tasks and assignments separately; merge them so each task carries
// the signed-in member's own assignment (status) plus the list of assignees.
const enrichedTasks = computed(() => tasks.value.map(task => {
  if (isDemoMode.value) return task
  const related = assignments.value.filter(a => String(getId(a.task)) === String(task._id))
  const mine = related.find(a => String(getId(a.member)) === myId.value) || null
  let status = ''
  if (mine) status = mine.status
  else if (related.length) {
    const all = related.map(a => a.status)
    status = all.every(x => x === 'complete') ? 'complete' : all.includes('fail') ? 'fail' : 'inProgress'
  }
  return { ...task, myAssignment: mine, status, assignees: related.map(a => a.member).filter(Boolean) }
}))

const visibleMembers = computed(() => members.value.filter(m => `${getMemberName(m)} ${m.email || ''}`.toLowerCase().includes(search.value.toLowerCase())))

const STATUS_ORDER = { 'Blocked': 0, 'In progress': 1, 'To do': 2, 'Completed': 3 }
const visibleTasks = computed(() => {
  const list = [...filteredTasks.value]
  const due = x => x.endDate ? new Date(x.endDate).getTime() : Infinity
  switch (taskSort.value) {
    case 'due': return list.sort((a, b) => due(a) - due(b))
    case 'priority': return list.sort((a, b) => PRIORITY_RANK[extras.get(b._id).priority] - PRIORITY_RANK[extras.get(a._id).priority])
    case 'title': return list.sort((a, b) => String(a.title).localeCompare(String(b.title)))
    case 'status': return list.sort((a, b) => STATUS_ORDER[taskStatus(a)] - STATUS_ORDER[taskStatus(b)])
    default: return list
  }
})
const allTags = computed(() => { void tasks.value.length; return extras.allTags() })

const allTemplates = computed(() => templateStore.all())
function applyTemplate(tpl) {
  const start = new Date().toISOString().slice(0, 10)
  taskForm.value.title = tpl.title
  taskForm.value.description = tpl.description
  taskForm.value.startDate = start
  taskForm.value.endDate = new Date(Date.now() + (tpl.durationDays || 7) * 86400000).toISOString().slice(0, 10)
  pendingTemplate.value = tpl
}
function saveAsTemplate() {
  const task = detailTask.value
  if (!task) return
  const name = (prompt('Template name', task.title) || '').trim()
  if (!name) return
  const e = extras.get(task._id)
  const days = Math.max(1, Math.round((new Date(task.endDate) - new Date(task.startDate)) / 86400000) || 7)
  templateStore.add({ name, title: task.title, description: task.description, priority: e.priority, tags: [...e.tags], recurrence: e.recurrence, durationDays: days, subtasks: e.subtasks.map(x => x.text) })
  notify(`Template "${name}" saved`)
}
const removeTemplate = tpl => { templateStore.remove(tpl.id); if (pendingTemplate.value?.id === tpl.id) pendingTemplate.value = null }
watch(showTaskModal, open => { if (!open) pendingTemplate.value = null })

// --- Time tracking ---
const detailTimer = computed(() => detailExtras.value.timer || null)
const detailLogged = computed(() => detailTask.value ? extras.logged(detailTask.value._id) : 0)
const timerElapsed = computed(() => {
  const t = detailTimer.value
  if (!t) return ''
  const sec = Math.max(0, Math.floor((nowTs.value - t.startedAt) / 1000))
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
})
function parseDuration(text) {
  const raw = String(text || '').trim().toLowerCase()
  if (!raw) return 0
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw)) // plain number = minutes
  const h = /(\d+(?:\.\d+)?)\s*h/.exec(raw)
  const m = /(\d+)\s*m/.exec(raw)
  return Math.round((h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0))
}
function logTime() {
  const minutes = parseDuration(timeInput.value)
  if (!minutes || !detailTask.value) return notify('Enter a duration like 45, 1h30m or 1.5h', true)
  safely(() => extras.addTime(detailTask.value._id, me.value, minutes))
  logAct(`logged ${fmtMinutes(minutes)} on "${detailTask.value.title}"`, detailTask.value._id)
  timeInput.value = ''
}
function toggleTimer() {
  const task = detailTask.value
  if (!task) return
  if (detailTimer.value) {
    const minutes = extras.stopTimer(task._id)
    logAct(`logged ${fmtMinutes(minutes)} on "${task.title}"`, task._id)
    notify(`Logged ${fmtMinutes(minutes)}`)
  } else {
    safely(() => extras.startTimer(task._id, me.value))
  }
}
const setEstimate = e => safely(() => extras.setEstimate(detailTask.value._id, e.target.value))

const myAssignments = computed(() => isDemoMode.value
  ? assignments.value
  : assignments.value.filter(a => String(getId(a.member)) === myId.value))

// Real backend: roles come from each member's `teams: [{ teamId, name, role }]` (admin | editor | viewer, plus legacy aliases).
const normRole = r => /admin/i.test(r || '') ? 'admin' : /viewer/i.test(r || '') ? 'viewer' : 'editor'
function roleIn(team, member) {
  const id = String(getId(member))
  if (isDemoMode.value) return teamAdminIds(team).some(a => String(getId(a)) === id) ? 'admin' : teamRoles.get(team._id, id) === 'viewer' ? 'viewer' : 'editor'
  const full = members.value.find(m => String(m._id) === id) || (id === myId.value ? currentUser.value : null)
  const entry = (full?.teams || []).find(x => String(getId(x.teamId || x.team)) === String(team._id))
  if (entry?.role) return normRole(entry.role)
  return teamAdminIds(team).some(a => String(getId(a)) === id) ? 'admin' : 'editor'
}
const isViewer = task => {
  if (isAdmin.value) return false
  const team = teams.value.find(x => String(x._id) === String(getId(task.team)))
  return !!team && roleIn(team, { _id: myId.value }) === 'viewer' && !canManageTask(task)
}
const canToggle = task => (isDemoMode.value || !!task.myAssignment) && !isViewer(task)

// Mirrors the backend rule: system admin, task creator, or owner/admin of the task's team.
const canManageTask = task => {
  if (isAdmin.value) return true
  if (String(getId(task.createdBy)) === myId.value) return true
  const team = teams.value.find(t => String(t._id) === String(getId(task.team)))
  return !!team && (String(getId(team.addedBy)) === myId.value || teamAdminIds(team).some(a => String(getId(a)) === myId.value))
}

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
const passwordIssue = pw => PASSWORD_RE.test(pw || '') ? '' : 'Password must be 8+ characters with upper and lower case letters, a number and one of @ $ ! % * ? &'

const filteredTasks = computed(() => {
  return enrichedTasks.value.filter(t => {
    const matchesSearch = `${t.title} ${t.description} ${t.team?.name || ''}`.toLowerCase().includes(search.value.toLowerCase())
    if (!matchesSearch) return false
    if (taskTeamFilter.value !== 'all' && String(getId(t.team)) !== String(taskTeamFilter.value)) return false
    if (taskTagFilter.value !== 'all' && !extras.get(t._id).tags.includes(taskTagFilter.value)) return false
    if (taskFilter.value === 'all') return true
    if (taskFilter.value === 'completed') return taskStatus(t) === 'Completed'
    if (taskFilter.value === 'inProgress') return taskStatus(t) === 'In progress'
    if (taskFilter.value === 'blocked') return taskStatus(t) === 'Blocked'
    return true
  })
})

const completedCount = computed(() => enrichedTasks.value.filter(t => taskStatus(t) === 'Completed').length)
const inProgressCount = computed(() => enrichedTasks.value.filter(t => taskStatus(t) === 'In progress').length)
const overdueCount = computed(() => enrichedTasks.value.filter(t => taskStatus(t) !== 'Completed' && t.endDate && new Date(t.endDate) < new Date(new Date().toDateString())).length)
const completionRate = computed(() => tasks.value.length ? Math.round((completedCount.value / tasks.value.length) * 100) : 0)

const getId = val => typeof val === 'object' && val ? val._id || val.id : val
const getMemberName = m => `${m?.fname || ''} ${m?.lname || ''}`.trim() || m?.email || 'Member'
const dateLabel = date => date ? new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

// --- Notifications ---
function notify(message, isError = false) {
  toast.value = message
  error.value = isError ? message : ''
  setTimeout(() => {
    if (toast.value === message) toast.value = ''
  }, 4000)
}

async function run(action, successMessage) {
  busy.value = true
  try {
    const result = await action()
    if (successMessage) notify(successMessage)
    return result
  } catch (e) {
    if (e.code === 'EMAIL_NOT_CONFIRMED' && !token.value) authMode.value = 'confirm' // go straight to the OTP screen
    notify(e.message || 'Action failed', true)
    return null
  } finally {
    busy.value = false
  }
}

// --- Data Loading ---
async function loadWorkspace() {
  loading.value = true
  if (isDemoMode.value) {
    disableSync()
    currentUser.value = demoUser
    tasks.value = [...demoTasks]
    teams.value = [...demoTeams]
    members.value = [...demoMembers]
    assignments.value = [...demoAssignments]
    if (!teams.value.some(t => String(t._id) === String(taskForm.value.teamId))) {
      taskForm.value.teamId = teams.value[0]?._id || ''
    }
    loading.value = false
    return
  }

  enableSync({
    api,
    onError: e => notify(e.message || 'Could not save your change', true),
    refresh: id => refreshTask(id)
  })
  const loadStartedAt = new Date(Date.now() - 2000).toISOString() // /changes cursor: anything after the lists were fetched
  try {
    const [profileRes, taskRes, teamRes, memberRes, assignmentRes] = await Promise.allSettled([
      api.getProfile(),
      api.tasks(),
      api.teams(),
      api.members(),
      api.assignments()
    ])

    const failedLoad = [profileRes, taskRes, teamRes, memberRes, assignmentRes].find(r => r.status === 'rejected')
    if (failedLoad) notify(failedLoad.reason?.message || 'Some data could not be loaded', true)

    if (profileRes.status === 'fulfilled' && profileRes.value?.data) {
      currentUser.value = profileRes.value.data
      localStorage.setItem('taskverse-user', JSON.stringify(currentUser.value))
    }
    if (taskRes.status === 'fulfilled') tasks.value = hydrateAll(asArray(taskRes.value))
    if (teamRes.status === 'fulfilled') teams.value = asArray(teamRes.value)
    if (memberRes.status === 'fulfilled') members.value = asArray(memberRes.value)
    if (assignmentRes.status === 'fulfilled') assignments.value = asArray(assignmentRes.value)
    changesCursor = loadStartedAt
    templateStore.loadRemote().catch(() => {})
    loadNotifications()

    if (!teams.value.some(t => String(t._id) === String(taskForm.value.teamId))) {
      taskForm.value.teamId = teams.value[0]?._id || ''
    }
  } catch (e) {
    notify(e.message, true)
  } finally {
    loading.value = false
  }
}

const asArray = asList
// Server fields (priority, tags, subtasks, estimate ...) live on the task; mirror them into the extras view-model.
const hydrateAll = list => { list.forEach(t => extras.hydrate(t)); return list }
// Full task (comments, attachments, time) is fetched when a task card opens or after a failed optimistic write.
async function refreshTask(id) {
  if (isDemoMode.value || !id) return
  try {
    const res = await api.task(id)
    const full = res?.data?.task || res?.data
    if (!full?._id) return
    extras.hydrate(full)
    const i = tasks.value.findIndex(t => String(t._id) === String(full._id))
    if (i >= 0) tasks.value[i] = { ...tasks.value[i], ...full }
  } catch (e) { if (e.status === 404) await reload('tasks', 'assignments') }
}
// --- Real-time (SSE with polling fallback; see services/realtime.js) ---
let rtTimer
const rtKeys = new Set()
const RT_MAP = { task: ['tasks', 'assignments'], assignment: ['assignments', 'tasks'], team: ['teams', 'tasks'], member: ['members', 'teams'], notification: ['notifications'], comment: ['tasks'], attachment: ['tasks'], time: ['tasks'] }
// Vercel-safe sync: ask the server what changed since the last cursor and reload only those lists.
let changesCursor = ''
async function pollChanges() {
  if (busy.value || isDemoMode.value || !token.value) return
  try {
    const res = await api.changes(changesCursor || new Date(Date.now() - 60000).toISOString())
    const d = res?.data || {}
    if (d.now) changesCursor = d.now
    const has = g => (d[g]?.upserted?.length || 0) + (d[g]?.deleted?.length || 0) > 0
    const keys = new Set(['notifications'])
    if (has('tasks') || has('assignments')) { keys.add('tasks'); keys.add('assignments') }
    if (has('teams')) { keys.add('teams'); keys.add('tasks') }
    if (has('members')) { keys.add('members'); keys.add('teams') }
    await silentReload([...keys])
    if (detailTaskId.value && showTaskDetail.value && has('tasks')) refreshTask(detailTaskId.value)
  } catch (e) {
    if (e.status === 404 || e.status === 501) await silentReload(['tasks', 'teams', 'members', 'assignments', 'notifications']) // no /changes: full refresh
  }
}
async function silentReload(keys) {
  if (busy.value) return
  await Promise.allSettled(keys.map(k => loaders[k]?.()))
}
function onRealtimeEvent(evt) {
  const group = String(evt?.type || '').split('.')[0]
  ;(RT_MAP[group] || ['tasks', 'teams', 'members', 'assignments']).forEach(k => rtKeys.add(k))
  clearTimeout(rtTimer)
  rtTimer = setTimeout(() => { const keys = [...rtKeys]; rtKeys.clear(); silentReload(keys) }, 400)
  if (evt?.message && String(evt.actorId || '') !== myId.value) notify(evt.message)
}
function syncRealtime() {
  if (token.value && !isDemoMode.value) {
    startRealtime({
      baseUrl: API_BASE_URL,
      getToken: () => localStorage.getItem('taskverse-token') || '',
      onEvent: onRealtimeEvent,
      onPoll: pollChanges
    })
  } else stopRealtime()
}
const loaders = {
  tasks: async () => { tasks.value = hydrateAll(asArray(await api.tasks())) },
  teams: async () => { teams.value = asArray(await api.teams()) },
  members: async () => { members.value = asArray(await api.members()) },
  assignments: async () => { assignments.value = asArray(await api.assignments()) },
  notifications: loadNotifications,
}
// Refresh only what changed instead of re-fetching everything (keeps us well under the API rate limit).
async function reload(...keys) {
  const results = await Promise.allSettled(keys.map(k => loaders[k]()))
  const failed = results.find(r => r.status === 'rejected')
  if (failed) notify(failed.reason?.message || 'Could not refresh data', true)
  if (!teams.value.some(t => String(t._id) === String(taskForm.value.teamId))) {
    taskForm.value.teamId = teams.value[0]?._id || ''
  }
}

// Demo Mode Toggle
function toggleDemoMode() {
  isDemoMode.value = !isDemoMode.value
  localStorage.setItem('taskverse-demo', String(isDemoMode.value))
  if (isDemoMode.value) {
    token.value = 'demo-jwt-token'
    localStorage.setItem('taskverse-token', 'demo-jwt-token')
    loadWorkspace()
    notify('Loaded interactive Demo Workspace')
  } else {
    clearSession()
    token.value = ''
    currentUser.value = null
    tasks.value = []
    teams.value = []
    members.value = []
    assignments.value = []
    notify('Switched to live backend connection')
  }
}

function activateDemoMode() {
  isDemoMode.value = true
  localStorage.setItem('taskverse-demo', 'true')
  token.value = 'demo-jwt-token'
  localStorage.setItem('taskverse-token', 'demo-jwt-token')
  loadWorkspace()
  notify('Welcome to TaskVerse Demo!')
}

// --- Auth Actions ---
async function signIn() {
  await run(async () => {
    const r = await api.signIn({ email: authForm.value.email, password: authForm.value.password })
    setSession(r.data)
    token.value = r.data.accessToken
    isDemoMode.value = false
    localStorage.removeItem('taskverse-demo')
    await loadWorkspace()
    activeNav.value = 'Overview'
  }, 'Signed in successfully')
}

async function signUp() {
  const issue = passwordIssue(authForm.value.password)
  if (issue) return notify(issue, true)
  if (authForm.value.password !== authForm.value.confirmPassword) return notify('Passwords do not match', true)
  await run(async () => {
    await api.signUp({
      fname: authForm.value.fname,
      lname: authForm.value.lname,
      email: authForm.value.email,
      password: authForm.value.password,
      confirmPassword: authForm.value.confirmPassword,
      gender: authForm.value.gender
    })
    authMode.value = 'confirm'
    notify('Account created! Please enter the 6-digit verification code sent to your email.')
  })
}

async function confirmSignUp() {
  await run(async () => {
    await api.confirmSignUp({ email: authForm.value.email, otp: authForm.value.otp })
    authMode.value = 'signin'
    notify('Email confirmed! You can now sign in.')
  })
}

async function resendOtp() {
  await run(() => api.resendOtp({ email: authForm.value.email }), 'Verification code resent')
}

async function googleSignIn() {
  await run(async () => {
    const r = await api.googleSignIn({ idToken: authForm.value.idToken })
    setSession(r.data)
    token.value = r.data.accessToken
    await loadWorkspace()
  }, 'Signed in with Google')
}

async function requestPasswordReset() {
  await run(async () => {
    await api.forgotPassword({ email: resetForm.value.email })
    authMode.value = 'reset'
    notify('Reset code sent if the email is registered.')
  })
}

async function resetPassword() {
  const issue = passwordIssue(resetForm.value.password)
  if (issue) return notify(issue, true)
  if (resetForm.value.password !== resetForm.value.confirmPassword) return notify('Passwords do not match', true)
  await run(async () => {
    await api.resetPassword(resetForm.value)
    authMode.value = 'signin'
    notify('Password reset successfully. Please sign in.')
  })
}

async function refreshSession() {
  if (isDemoMode.value) {
    notify('Demo session is always active')
    return
  }
  await run(async () => {
    const r = await api.refreshToken()
    setSession(r.data)
    token.value = r.data.accessToken
    await loadWorkspace()
  }, 'Session refreshed')
}

async function signOut(flag = '') {
  if (!isDemoMode.value) {
    try { await api.logout(flag) } catch {}
  }
  clearSession()
  localStorage.removeItem('taskverse-demo')
  isDemoMode.value = false
  token.value = ''
  currentUser.value = null
  tasks.value = []
  teams.value = []
  members.value = []
  assignments.value = []
  authMode.value = 'signin'
  notify('Signed out successfully')
}

// --- Task & Team Operations ---
async function createTask() {
  if (!taskForm.value.teamId) return notify('Every task belongs to a team. Create a team first.', true)
  if (new Date(taskForm.value.endDate) < new Date(taskForm.value.startDate)) return notify('Due date cannot be before the start date', true)
  if (isDemoMode.value) {
    const targetTeam = teams.value.find(t => t._id === taskForm.value.teamId) || teams.value[0]
    const newTask = {
      _id: 'task_' + Date.now(),
      title: taskForm.value.title,
      description: taskForm.value.description,
      startDate: taskForm.value.startDate,
      endDate: taskForm.value.endDate,
      team: { _id: targetTeam?._id, name: targetTeam?.name },
      status: 'to-do',
      myAssignment: null
    }
    newTask.assignees = members.value.filter(m => createAssignees.value.includes(String(m._id)))
    if (pendingTemplate.value) templateStore.applyTo(newTask._id, pendingTemplate.value)
    tasks.value.unshift(newTask)
    createAssignees.value = []
    showTaskModal.value = false
    taskForm.value.title = ''
    taskForm.value.description = ''
    logAct(`created task "${newTask.title}"`, newTask._id)
    notify('Task created (Demo Mode)')
    return
  }

  await run(async () => {
    const tpl = pendingTemplate.value
    const picked = [...createAssignees.value]
    const body = { ...taskForm.value, teamId: taskForm.value.teamId }
    if (tpl?.priority) body.priority = tpl.priority
    if (tpl?.tags?.length) body.tags = [...tpl.tags]
    if (tpl?.recurrence && tpl.recurrence !== 'none') body.recurrence = tpl.recurrence
    if (tpl?.subtasks?.length) body.subtasks = [...tpl.subtasks]
    if (picked.length) body.assignees = picked // assignments are created in the same request
    const title = taskForm.value.title
    await api.createTask(body)
    showTaskModal.value = false
    taskForm.value.title = ''
    taskForm.value.description = ''
    createAssignees.value = []
    logAct(`created task "${title || 'new task'}"`)
    await reload('tasks', 'assignments')
  }, 'Task created successfully')
}

// --- Undo ---------------------------------------------------------------------------------------
// Deletes are *deferred*: the item disappears at once, but the API call only runs after the undo window.
// Status changes are already saved, so their undo is a compensating update.
const UNDO_MS = 8000
const pendingActions = new Set()

function flushPending() {
  for (const a of [...pendingActions]) a.finish()
}
function offerUndo(message, onUndo, onExpire) {
  const entry = { done: false }
  const clear = () => { entry.done = true; clearTimeout(entry.timer); pendingActions.delete(entry); if (undoToast.value?.entry === entry) undoToast.value = null }
  entry.finish = async () => { if (entry.done) return; clear(); await onExpire?.() }
  entry.undo = async () => { if (entry.done) return; clear(); await onUndo(); notify('Restored') }
  entry.timer = setTimeout(entry.finish, UNDO_MS)
  pendingActions.add(entry)
  undoToast.value = { message, entry }
  return entry
}

async function deleteTask(task) {
  flushPending()
  const id = String(task._id)
  const original = tasks.value.find(t => String(t._id) === id) || task
  const index = tasks.value.indexOf(original)
  const removedAssignments = assignments.value.filter(a => String(getId(a.task)) === id)
  tasks.value = tasks.value.filter(t => String(t._id) !== id)
  assignments.value = assignments.value.filter(a => String(getId(a.task)) !== id)
  logAct(`deleted task "${task.title}"`)

  if (!isDemoMode.value) {
    try { await api.deleteTask(task._id) } catch (e) {
      tasks.value.splice(Math.max(0, index), 0, original); assignments.value.push(...removedAssignments)
      return notify(`Could not delete "${task.title}": ${e.message}`, true)
    }
    offerUndo(`Task "${task.title}" deleted`, async () => { await api.restoreTask(task._id); await reload('tasks', 'assignments') })
    return
  }
  offerUndo(`Task "${task.title}" deleted`,
    () => {
      tasks.value.splice(Math.max(0, index), 0, original)
      assignments.value.push(...removedAssignments)
    })
}

const addInterval = (value, kind) => {
  const d = new Date(value || Date.now())
  if (kind === 'daily') d.setDate(d.getDate() + 1)
  else if (kind === 'weekly') d.setDate(d.getDate() + 7)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

// When a repeating task is completed, create its next occurrence and let that one carry the schedule forward.
async function spawnNextOccurrence(task) {
  const kind = extras.get(task._id).recurrence
  if (!kind || kind === 'none') return
  const fields = {
    title: task.title, description: task.description,
    startDate: addInterval(task.startDate, kind), endDate: addInterval(task.endDate, kind),
    teamId: String(getId(task.team) || '')
  }
  let newId = ''
  if (isDemoMode.value) {
    newId = 'task_' + Date.now()
    tasks.value.unshift({ _id: newId, ...fields, team: task.team, status: 'to-do', myAssignment: null, assignees: [...(task.assignees || [])] })
  } else {
    try {
      await api.completeAndSpawn(task._id)
      await reload('tasks', 'assignments')
    } catch (e) { return notify(`Could not create the next occurrence: ${e.message}`, true) }
    logAct(`created the next ${kind} occurrence of "${task.title}"`, task._id)
    return notify(`Next ${kind} occurrence created`)
  }
  if (newId) extras.cloneForNext(task._id, newId)
  extras.setRecurrence(task._id, 'none')
  logAct(`created the next ${kind} occurrence of "${task.title}" (due ${fields.endDate})`, newId)
  notify(`Next ${kind} occurrence created — due ${dateLabel(fields.endDate)}`)
}

// --- Export (CSV for Excel, PDF via the print dialog) ---
const showExport = ref(false)
const taskExportRows = list => list.map(x => [
  x.title, stripRich(x.description), x.team?.name || 'General', taskStatus(x), extras.get(x._id).priority || '',
  extras.get(x._id).tags.join(' | '), (x.assignees || []).map(getMemberName).join(' | '),
  toDateInput(x.startDate), toDateInput(x.endDate),
  extras.progress(x._id).total ? `${extras.progress(x._id).done}/${extras.progress(x._id).total}` : '',
  extras.get(x._id).estimateMin ? (extras.get(x._id).estimateMin / 60).toFixed(2) : '', extras.logged(x._id) ? (extras.logged(x._id) / 60).toFixed(2) : ''
])
const TASK_HEADERS = ['Title', 'Description', 'Team', 'Status', 'Priority', 'Tags', 'Assignees', 'Start', 'Due', 'Subtasks', 'Estimate (h)', 'Logged (h)']
const stamp = () => new Date().toISOString().slice(0, 10)
function exportTasksCSV(list = visibleTasks.value) {
  showExport.value = false
  downloadCSV(`taskverse-tasks-${stamp()}.csv`, TASK_HEADERS, taskExportRows(list))
  notify(`Exported ${list.length} task(s) to CSV`)
}
function timeByMemberRows(list) {
  const ids = new Set(list.map(x => String(x._id)))
  const totals = new Map()
  for (const [taskId, e] of Object.entries(extras.all())) {
    if (!ids.has(String(taskId))) continue
    for (const x of e.timeEntries || []) totals.set(x.authorName, (totals.get(x.authorName) || 0) + x.minutes)
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name, m]) => [name, (m / 60).toFixed(2)])
}
function exportReportPDF(list = visibleTasks.value) {
  showExport.value = false
  const today = new Date(new Date().toDateString())
  const late = x => taskStatus(x) !== 'Completed' && x.endDate && new Date(x.endDate) < today
  const teamRows = teams.value.map(team => {
    const l = list.filter(x => String(getId(x.team)) === String(team._id))
    const done = l.filter(x => taskStatus(x) === 'Completed').length
    return [team.name, l.length, done, l.filter(late).length, l.length ? Math.round(done / l.length * 100) + '%' : '—']
  })
  const memberRows = members.value.map(m => {
    const l = memberTasks(m)
    return [getMemberName(m), m.email, l.length, l.filter(x => taskStatus({ status: x.status }) === 'Completed').length]
  }).filter(r => r[2])
  try {
    printReport({
      title: 'TaskVerse — Tasks report', subtitle: `${list.length} tasks · ${stamp()}`, rtl: lang.value === 'ar',
      sections: [
        { heading: 'Summary by team', headers: ['Team', 'Tasks', 'Completed', 'Overdue', 'Progress'], rows: teamRows },
        { heading: 'Workload by member', headers: ['Member', 'Email', 'Assigned', 'Completed'], rows: memberRows },
        { heading: 'Time tracked by member', headers: ['Member', 'Hours logged'], rows: timeByMemberRows(list) },
        { heading: 'Tasks', headers: TASK_HEADERS, rows: taskExportRows(list) }
      ]
    })
  } catch (e) { notify(e.message, true) }
}

const dashTeamObj = computed(() => dashTeam.value === 'all' ? null : teams.value.find(x => String(x._id) === String(dashTeam.value)) || null)
const dashTasks = computed(() => enrichedTasks.value.filter(x => String(getId(x.team)) === String(dashTeam.value)))
const dashMembers = computed(() => {
  const ids = new Set((dashTeamObj.value?.teamMembers || []).map(m => String(getId(m))))
  return members.value.filter(m => ids.has(String(m._id)))
})
watch(dashTeam, v => { taskTeamFilter.value = v })
function openTeamDashboard(team) { dashTeam.value = team._id; showTeamDetail.value = false; activeNav.value = 'Overview' }

const completedAtOf = task => {
  const own = extras.get(task._id).completedAt || task.completedAt || task.myAssignment?.completedAt
  if (own) return own
  const rel = assignments.value.filter(a => String(getId(a.task)) === String(task._id) && a.completedAt)
  return rel.map(a => a.completedAt).sort().pop() || ''
}

const logAct = (text, taskId = '') => logActivity({ actorName: fullName.value, text, taskId })
const STATUS_LABEL = { inProgress: 'In progress', complete: 'Completed', completed: 'Completed', fail: 'Blocked', failed: 'Blocked', 'to-do': 'To do', toDo: 'To do' }

async function setTaskStatus(task, nextStatus, { silent = false } = {}) {
  if (isDemoMode.value) {
    task.status = nextStatus
    if (task.myAssignment) task.myAssignment.status = nextStatus
    logAct(`moved "${task.title}" to ${STATUS_LABEL[nextStatus]}`, task._id)
    extras.setCompleted(task._id, nextStatus === 'complete' ? new Date().toISOString() : '')
    if (!silent) notify(`Status updated to ${STATUS_LABEL[nextStatus]}`)
    if (nextStatus === 'complete') await spawnNextOccurrence(task)
    return true
  }
  const assignment = task.myAssignment
  if (!assignment) { if (!silent) notify('Only members assigned to a task can change its status', true); return false }
  const ok = await run(async () => {
    await api.updateTaskStatus({ taskId: task._id, status: nextStatus })
    assignment.status = nextStatus
    assignment.completedAt = nextStatus === 'complete' ? new Date().toISOString() : null
    return true
  }, silent ? '' : 'Task status updated')
  if (ok) {
    logAct(`moved "${task.title}" to ${STATUS_LABEL[nextStatus]}`, task._id)
    extras.setCompleted(task._id, nextStatus === 'complete' ? new Date().toISOString() : '')
    if (nextStatus === 'complete') await spawnNextOccurrence(task)
  }
  return !!ok
}

async function toggleTaskStatus(task) {
  const current = taskStatus(task)
  await setTaskStatus(task, current === 'Completed' ? 'inProgress' : current === 'In progress' ? 'complete' : 'inProgress')
}

// Kanban drop. Real backend statuses: toDo | inProgress | completed | failed (legacy complete / fail still accepted).
const COLUMN_STATUS = { 'In progress': 'inProgress', 'Completed': 'complete', 'Blocked': 'fail', 'To do': 'toDo' }
async function moveTask(task, label) {
  const prev = task.myAssignment?.status || task.status || ''
  const ok = await setTaskStatus(task, COLUMN_STATUS[label])
  if (ok && prev) offerUndo(`Moved to ${label}`, () => setTaskStatus(task, prev === 'completed' ? 'complete' : prev === 'failed' ? 'fail' : prev, { silent: true }))
}

// --- Bulk selection ---
const allVisibleSelected = computed(() => visibleTasks.value.length > 0 && visibleTasks.value.every(x => selectedIds.value.includes(String(x._id))))
const toggleSelectAll = () => { selectedIds.value = allVisibleSelected.value ? [] : visibleTasks.value.map(x => String(x._id)) }
const selectedTasks = computed(() => enrichedTasks.value.filter(x => selectedIds.value.includes(String(x._id))))
watch(visibleTasks, list => { const ids = new Set(list.map(x => String(x._id))); selectedIds.value = selectedIds.value.filter(id => ids.has(id)) })

async function bulkStatus(nextStatus) {
  const list = selectedTasks.value.filter(canToggle)
  const skipped = selectedTasks.value.length - list.length
  const prev = list.map(task => ({ task, raw: task.myAssignment?.status || task.status || '' }))
  let ok = 0
  const changed = []
  for (const x of prev) if (await setTaskStatus(x.task, nextStatus, { silent: true })) { ok++; changed.push(x) }
  selectedIds.value = []
  notify(`${ok} task(s) updated${skipped ? `, ${skipped} skipped (not assigned to you)` : ''}`, !ok && !!skipped)
  const undoable = changed.filter(x => x.raw)
  if (undoable.length) offerUndo(`${ok} task(s) updated`, async () => { for (const x of undoable) await setTaskStatus(x.task, x.raw === 'completed' ? 'complete' : x.raw === 'failed' ? 'fail' : x.raw, { silent: true }) })
}

async function bulkDelete() {
  const list = selectedTasks.value.filter(canManageTask)
  if (!list.length) return notify('You do not have permission to delete the selected tasks', true)
  flushPending()
  const ids = new Set(list.map(x => String(x._id)))
  const originals = tasks.value.filter(x => ids.has(String(x._id)))
  const positions = originals.map(o => tasks.value.indexOf(o))
  const removedAssignments = assignments.value.filter(a => ids.has(String(getId(a.task))))
  tasks.value = tasks.value.filter(x => !ids.has(String(x._id)))
  assignments.value = assignments.value.filter(a => !ids.has(String(getId(a.task))))
  selectedIds.value = []
  logAct(`deleted ${list.length} task(s)`)

  const restoreLocal = () => {
    originals.forEach((o, i) => tasks.value.splice(Math.min(positions[i], tasks.value.length), 0, o))
    assignments.value.push(...removedAssignments)
  }
  if (!isDemoMode.value) {
    let res
    try { res = await api.bulkDeleteTasks([...ids]) } catch (e) { restoreLocal(); return notify(`Could not delete: ${e.message}`, true) }
    const skipped = res?.data?.skipped?.length || 0
    if (skipped) { notify(`${skipped} task(s) could not be deleted`, true); await reload('tasks', 'assignments') }
    offerUndo(`${list.length - skipped} task(s) deleted`, async () => { await api.bulkRestoreTasks([...ids]); await reload('tasks', 'assignments') })
    return
  }
  offerUndo(`${list.length} task(s) deleted`, restoreLocal)
}

// --- Tags & subtasks (task detail card) ---
const detailTags = computed(() => detailTask.value ? extras.get(detailTask.value._id).tags : [])
const detailSubtasks = computed(() => detailTask.value ? extras.get(detailTask.value._id).subtasks : [])
function addTag() {
  const tag = newTag.value.trim().slice(0, 24)
  if (!tag || !detailTask.value || detailTags.value.includes(tag)) { newTag.value = ''; return }
  safely(() => extras.setTags(detailTask.value._id, [...detailTags.value, tag]))
  logAct(`tagged "${detailTask.value.title}" #${tag}`, detailTask.value._id)
  newTag.value = ''
}
const removeTag = tag => safely(() => extras.setTags(detailTask.value._id, detailTags.value.filter(x => x !== tag)))
function addSubtask() {
  const text = newSubtask.value.trim()
  if (!text || !detailTask.value) return
  safely(() => extras.addSubtask(detailTask.value._id, text))
  logAct(`added subtask "${text}"`, detailTask.value._id)
  newSubtask.value = ''
}
const detailActivity = computed(() => detailTask.value ? activity.filter(a => a.taskId === detailTask.value._id).slice(0, 6) : [])

// --- Task details / edit card ---
const STATUS_OPTIONS = [
  { value: 'toDo', label: 'To do' },
  { value: 'inProgress', label: 'In progress' },
  { value: 'complete', label: 'Completed' },
  { value: 'fail', label: 'Blocked' }
]
const toDateInput = d => d ? new Date(d).toISOString().slice(0, 10) : ''
const detailTask = computed(() => enrichedTasks.value.find(t => String(t._id) === String(detailTaskId.value)) || null)
const detailCanContribute = computed(() => !!detailTask.value && !isViewer(detailTask.value))
const detailCanEdit = computed(() => !!detailTask.value && canManageTask(detailTask.value))
const detailCandidates = computed(() => {
  const taken = new Set((detailTask.value?.assignees || []).map(m => String(getId(m))))
  return members.value.filter(m => !taken.has(String(m._id)))
})

const createTeamMembers = computed(() => {
  const team = teams.value.find(t => String(t._id) === String(taskForm.value.teamId))
  const ids = new Set((team?.teamMembers || []).map(m => String(getId(m))))
  return members.value.filter(m => ids.has(String(m._id)))
})
watch(() => taskForm.value.teamId, () => { createAssignees.value = [] })

const detailTeamPool = task => {
  const team = teams.value.find(t => String(t._id) === String(getId(task.team)))
  const taken = new Set((task.assignees || []).map(m => String(getId(m))))
  return (team?.teamMembers || []).map(m => String(getId(m))).filter(id => !taken.has(id))
}

function openTaskDetail(task) {
  detailTaskId.value = task._id
  detailForm.value = {
    title: task.title || '',
    description: task.description || '',
    startDate: toDateInput(task.startDate),
    endDate: toDateInput(task.endDate),
    teamId: String(getId(task.team) || '')
  }
  const s = task.myAssignment?.status || task.status
  detailStatus.value = ['complete', 'completed'].includes(s) ? 'complete' : ['fail', 'failed'].includes(s) ? 'fail' : ['toDo', 'to-do'].includes(s) ? 'toDo' : 'inProgress'
  detailPick.value = []
  showTaskDetail.value = true
  refreshTask(task._id)
}

async function saveTaskDetail() {
  const task = detailTask.value
  if (!task) return
  const f = detailForm.value
  if (new Date(f.endDate) < new Date(f.startDate)) return notify('Due date cannot be before the start date', true)

  if (isDemoMode.value) {
    const team = teams.value.find(t => String(t._id) === String(f.teamId))
    const target = tasks.value.find(t => String(t._id) === String(task._id))
    Object.assign(target, {
      title: f.title, description: f.description, startDate: f.startDate, endDate: f.endDate,
      team: team ? { _id: team._id, name: team.name } : target.team
    })
    applyStatusLocally(target, detailStatus.value)
    showTaskDetail.value = false
    logAct(`edited task "${f.title}"`, task._id)
    notify('Task updated (Demo Mode)')
    return
  }

  await run(async () => {
    if (detailCanEdit.value) await api.updateTask(task._id, { ...f })
    const current = task.myAssignment?.status
    if (task.myAssignment && current !== detailStatus.value) {
      await api.updateTaskStatus({ taskId: task._id, status: detailStatus.value })
    }
    showTaskDetail.value = false
    logAct(`edited task "${f.title}"`, task._id)
    await reload('tasks', 'assignments')
  }, 'Task updated successfully')
}

function applyStatusLocally(task, status) {
  task.status = status
  if (task.myAssignment) task.myAssignment.status = status
}

// Runs one API call per id and reports how many succeeded; throws only if every call failed.
async function bulk(ids, fn) {
  const results = await Promise.allSettled(ids.map(fn))
  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length === ids.length) throw failed[0].reason
  return { ok: ids.length - failed.length, failed: failed.length }
}
const bulkMessage = (verb, { ok, failed }) => failed ? `${ok} ${verb}, ${failed} failed (already added or not allowed)` : `${ok} ${verb}`

async function assignMembers(taskId, memberIds) {
  logAct(`assigned ${memberIds.length} member(s) to "${tasks.value.find(x => x._id === taskId)?.title || 'a task'}"`, taskId)
  if (isDemoMode.value) {
    const t = tasks.value.find(item => item._id === taskId)
    const picked = members.value.filter(m => memberIds.includes(String(m._id)))
    t.assignees = [...(t.assignees || []), ...picked]
    assignments.value.push(...picked.map(m => ({ _id: 'asg_' + Date.now() + m._id, status: 'inProgress', task: t, member: m })))
    notify(`${picked.length} member(s) assigned (Demo Mode)`)
    return
  }
  await run(async () => {
    const r = await api.addMemberToTask({ taskId, memberIds })
    const added = Array.isArray(r?.data?.added) ? r.data.added.length : memberIds.length
    await reload('assignments', 'tasks')
    notify(bulkMessage('assigned', { ok: added, failed: memberIds.length - added }), added < memberIds.length)
  })
}

async function addMembersFromDetail() {
  if (!detailPick.value.length || !detailTask.value) return
  const ids = [...detailPick.value]
  detailPick.value = []
  await assignMembers(detailTask.value._id, ids)
}

function openCreateTeam() {
  teamEdit.value = { teamId: '', name: '' }
  teamName.value = ''
  showTeamModal.value = true
}

async function createTeam() {
  if (isDemoMode.value) {
    const newTeam = {
      _id: 'team_' + Date.now(),
      name: teamName.value,
      addedBy: currentUser.value?._id,
      teamAdmins: [currentUser.value?._id],
      teamMembers: [currentUser.value],
      createdAt: new Date().toISOString()
    }
    teams.value.push(newTeam)
    teamName.value = ''
    showTeamModal.value = false
    notify('Team created (Demo Mode)')
    return
  }

  await run(async () => {
    await api.createTeam({ name: teamName.value })
    teamName.value = ''
    showTeamModal.value = false
    await reload('teams')
  }, 'Team created')
}

async function renameTeam() {
  if (isDemoMode.value) {
    const t = teams.value.find(item => item._id === teamEdit.value.teamId)
    if (t) t.name = teamEdit.value.name
    showTeamModal.value = false
    notify('Team renamed (Demo Mode)')
    return
  }

  await run(async () => {
    await api.updateTeamName(teamEdit.value)
    showTeamModal.value = false
    await reload('teams')
  }, 'Team updated')
}

async function deleteTeam(team) {
  if (!confirm(`Are you sure you want to delete "${team.name}"?`)) return
  if (isDemoMode.value) {
    teams.value = teams.value.filter(t => t._id !== team._id)
    notify('Team deleted (Demo Mode)')
    return
  }
  const done = await run(async () => {
    await api.deleteTeam({ teamId: team._id })
    await reload('teams', 'tasks')
    return true
  }, '')
  if (done) offerUndo(`Team "${team.name}" deleted`, async () => { await api.restoreTeam({ teamId: team._id }); await reload('teams', 'tasks') })
}

// --- Member administration (real backend only) ---
const memberEdit = ref({ fname: '', lname: '' })
const canEditMember = m => !isDemoMode.value && !!m && (isAdmin.value || String(m._id) === myId.value)
const canAdminMember = m => !isDemoMode.value && isAdmin.value && !!m && String(m._id) !== myId.value
const memberActive = m => m?.active !== false
async function saveMemberName() {
  const m = detailMember.value
  const { fname, lname } = memberEdit.value
  if (fname.trim().length < 2 || lname.trim().length < 2) return notify('First and last name need at least 2 characters', true)
  await run(async () => { await api.updateMember(m._id, { fname: fname.trim(), lname: lname.trim() }); await reload('members') }, 'Member updated')
}
async function toggleMemberActive() {
  const m = detailMember.value
  const next = !memberActive(m)
  if (!next && !confirm(`Deactivate ${getMemberName(m)}? They will not be able to sign in.`)) return
  await run(async () => { await api.setMemberActive(m._id, next); await reload('members') }, next ? 'Member activated' : 'Member deactivated')
}
async function resetMemberPassword() {
  const m = detailMember.value
  if (!confirm(`Email a password reset to ${m.email}?`)) return
  await run(() => api.resetMemberPassword(m._id), 'Password reset email sent')
}
async function removeMember() {
  const m = detailMember.value
  if (!confirm(`Delete ${getMemberName(m)}? Their tasks are unassigned and they leave all teams.`)) return
  await run(async () => { await api.deleteMember(m._id); showMemberDetail.value = false; await reload('members', 'teams', 'assignments', 'tasks') }, 'Member deleted')
}

// --- Account: devices (sessions) and notification preferences ---
const sessions = ref([])
const prefs = ref(null)
async function loadAccount() {
  if (isDemoMode.value || !token.value) return
  refreshPushState()
  try { sessions.value = asList(await api.sessions()) } catch { sessions.value = [] }
  try { prefs.value = (await api.preferences())?.data || null } catch { prefs.value = null }
}
watch(activeNav, n => { if (n === 'Profile & security') loadAccount() })
async function revokeSession(sess) {
  if (!confirm('Sign out this device?')) return
  await run(async () => { await api.revokeSession(sess._id); await loadAccount() }, 'Device signed out')
}
async function setPref(key, value) {
  prefs.value = { ...prefs.value, [key]: value }
  try { await api.updatePreferences({ [key]: value }) } catch (e) { notify(e.message, true); loadAccount() }
}
const PREF_ROWS = [
  { key: 'emailAssigned', label: 'Email me when I am assigned a task' },
  { key: 'emailMention', label: 'Email me when someone mentions me' },
  { key: 'emailDue', label: 'Email me about due and overdue tasks' },
  { key: 'emailDigest', label: 'Send me a daily digest' }
]
const sessionLabel = sess => {
  const ua = sess.userAgent || ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return [browser, os].filter(Boolean).join(' on ') || ua.slice(0, 40) || 'Unknown device'
}

// --- Share link (read-only public page) ---
const shareToken = ref('')
watch(() => detailTask.value?.shareToken, v => { shareToken.value = v || '' }, { immediate: true })
const shareUrl = computed(() => shareToken.value ? `${window.location.origin}/share/${shareToken.value}` : '')
async function createShare() {
  const task = detailTask.value
  await run(async () => {
    const r = await api.shareTask(task._id)
    const d = r?.data || {}
    shareToken.value = d.token || d.shareToken || String(d.url || '').split('/').pop() || ''
    try { await navigator.clipboard.writeText(shareUrl.value) } catch { /* clipboard may be blocked */ }
  }, 'Share link created and copied')
}
async function revokeShare() {
  const task = detailTask.value
  await run(async () => { await api.unshareTask(task._id); shareToken.value = '' }, 'Share link revoked')
}
async function copyShare() {
  try { await navigator.clipboard.writeText(shareUrl.value); notify('Link copied') } catch { notify(shareUrl.value) }
}

// --- Member detail card ---
const detailMember = computed(() => members.value.find(m => String(m._id) === String(detailMemberId.value)) || null)
watch(() => detailMember.value?._id, () => { const m = detailMember.value; if (m) memberEdit.value = { fname: m.fname || '', lname: m.lname || '' } }, { immediate: true })
const memberTeams = member => teams.value
  .filter(t => (t.teamMembers || []).some(m => String(getId(m)) === String(member._id)))
  .map(t => ({ team: t, isAdmin: teamAdminIds(t).some(a => String(getId(a)) === String(member._id)) || String(getId(t.addedBy)) === String(member._id) }))
  .map(x => ({ ...x, role: x.isAdmin ? 'Admin' : roleIn(x.team, member) === 'viewer' ? 'Viewer' : 'Editor' }))
const memberTasks = member => {
  const id = String(member._id)
  if (isDemoMode.value) {
    return tasks.value.filter(t => (t.assignees || []).some(a => String(getId(a)) === id)).map(t => ({ task: t, status: t.status }))
  }
  return assignments.value
    .filter(a => String(getId(a.member)) === id)
    .map(a => ({ task: enrichedTasks.value.find(t => String(t._id) === String(getId(a.task))) || (typeof a.task === 'object' ? a.task : null), status: a.status }))
    .filter(x => x.task)
}
function openMemberDetail(member) {
  detailMemberId.value = member._id
  showMemberDetail.value = true
}

// --- Priority / comments / attachments (stored client-side, see services/extras.js) ---
const me = computed(() => ({ id: myId.value, name: fullName.value }))
const detailExtras = computed(() => detailTask.value ? extras.get(detailTask.value._id) : { priority: '', comments: [], attachments: [] })
const fmtSize = n => n > 1024 * 1024 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'
const fmtWhen = d => new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const safely = fn => { try { return fn() } catch (e) { notify(e.message, true) } }

function setPriority(value) {
  if (!detailCanEdit.value || !detailTask.value) return
  safely(() => extras.setPriority(detailTask.value._id, detailExtras.value.priority === value ? '' : value))
}
function postComment() {
  const text = newComment.value.trim()
  if (!text || !detailTask.value) return
  if (safely(() => { extras.addComment(detailTask.value._id, me.value, text); return true })) { logAct(`commented on "${detailTask.value.title}"`, detailTask.value._id); newComment.value = '' }
}
const canDeleteOwn = authorId => detailCanEdit.value || String(authorId) === myId.value
async function onFilesPicked(e) {
  const files = [...e.target.files]
  e.target.value = ''
  for (const f of files) {
    try { await extras.addAttachment(detailTask.value._id, f, me.value) } catch (err) { notify(err.message, true) }
  }
}

async function removeAssignee(task, member) {
  if (!confirm(`Remove ${getMemberName(member)} from "${task.title}"?`)) return
  logAct(`removed ${getMemberName(member)} from "${task.title}"`, task._id)
  const mid = String(getId(member))
  if (isDemoMode.value) {
    const t = tasks.value.find(x => x._id === task._id)
    t.assignees = (t.assignees || []).filter(a => String(getId(a)) !== mid)
    return notify('Member removed from task (Demo Mode)')
  }
  await run(async () => {
    await api.removeMemberFromTask({ taskId: task._id, memberId: mid })
    await reload('assignments')
  }, 'Member removed from task')
}

// --- Notifications: the server's list when available, otherwise derived from loaded data ---
const serverNotifs = ref(null)
const NOTIF_KIND = { overdue: 'late', due_soon: 'soon', reminder: 'soon', assigned: 'assigned', mention: 'mention', comment: 'comment' }
async function loadNotifications() {
  if (isDemoMode.value) { serverNotifs.value = null; return }
  try {
    const list = asList(await api.notifications({ limit: 50 })).map(n => ({
      id: String(n._id), kind: NOTIF_KIND[n.type] || 'comment', title: n.text || n.title || n.type, sub: n.task?.title || '', taskId: getId(n.task) || n.taskId || '', read: !!n.readAt
    }))
    serverNotifs.value = list
    const next = new Set(readNotifs.value)
    list.filter(n => n.read).forEach(n => next.add(n.id))
    readNotifs.value = next
  } catch { serverNotifs.value = null } // endpoint missing: fall back to the derived list
}
const notifications = computed(() => {
  if (!isDemoMode.value && serverNotifs.value) return serverNotifs.value
  const list = []
  const today = new Date().toISOString().slice(0, 10)
  enrichedTasks.value.forEach(t => {
    if (taskStatus(t) === 'Completed' || !t.endDate) return
    const end = toDateInput(t.endDate)
    if (end < today) list.push({ id: `late:${t._id}:${end}`, kind: 'late', title: `Overdue: ${t.title}`, sub: `Was due ${dateLabel(t.endDate)}`, taskId: t._id })
    else if (extras.get(t._id).remindBefore && end <= new Date(Date.now() + extras.get(t._id).remindBefore * 86400000).toISOString().slice(0, 10)) list.push({ id: `soon:${t._id}:${end}`, kind: 'soon', title: `Due soon: ${t.title}`, sub: `Due ${dateLabel(t.endDate)}`, taskId: t._id })
  })
  myAssignments.value.filter(a => a.task && (a.status === 'inProgress')).forEach(a => {
    list.push({ id: `asg:${a._id}`, kind: 'assigned', title: `Assigned to you: ${a.task.title}`, sub: a.task.team?.name || 'General', taskId: a.task._id })
  })
  Object.entries(extras.all()).forEach(([taskId, e]) => {
    const t = tasks.value.find(x => String(x._id) === String(taskId))
    if (!t) return
    ;(e.comments || []).filter(c => String(c.authorId) !== myId.value).forEach(c => {
      const mentioned = mentionsOf(c.text, [myHandle.value]).length > 0
      list.push({ id: `cmt:${c.id}`, kind: mentioned ? 'mention' : 'comment', title: mentioned ? `${c.authorName} mentioned you in ${t.title}` : `${c.authorName} commented on ${t.title}`, sub: stripRich(c.text).slice(0, 80), taskId })
    })
  })
  return list
})
const myHandle = computed(() => handleOf(currentUser.value || {}))
const allHandles = computed(() => members.value.map(handleOf))

// Optional OS-level alerts for new unread items (permission is requested only on click).
const canDesktop = typeof Notification !== 'undefined' && Notification.permission !== 'denied'
const desktopOk = ref(typeof Notification !== 'undefined' && Notification.permission === 'granted')
const enableDesktop = async () => { desktopOk.value = (await Notification.requestPermission()) === 'granted' }
watch(notifications, list => {
  if (!desktopOk.value) return
  let shown
  try { shown = new Set(JSON.parse(localStorage.getItem('taskverse-desktop-shown') || '[]')) } catch { shown = new Set() }
  const fresh = list.filter(n => !readNotifs.value.has(n.id) && !shown.has(n.id))
  fresh.slice(0, 3).forEach(n => new Notification(n.title, { body: n.sub, icon: '/icons/icon-192.png', tag: n.id }))
  fresh.forEach(n => shown.add(n.id))
  try { localStorage.setItem('taskverse-desktop-shown', JSON.stringify([...shown].slice(-300))) } catch { /* ignore */ }
}, { immediate: true })

const unreadCount = computed(() => notifications.value.filter(n => !readNotifs.value.has(n.id)).length)
function persistRead() {
  try { localStorage.setItem('taskverse-read-notifs', JSON.stringify([...readNotifs.value])) } catch {}
}
function markAllRead() {
  notifications.value.forEach(n => readNotifs.value.add(n.id))
  readNotifs.value = new Set(readNotifs.value)
  persistRead()
  if (!isDemoMode.value && serverNotifs.value) api.markNotificationsRead({ all: true }).catch(e => notify(e.message, true))
}
function openNotification(n) {
  readNotifs.value = new Set(readNotifs.value).add(n.id)
  persistRead()
  if (!isDemoMode.value && serverNotifs.value) api.markNotificationsRead({ ids: [n.id] }).catch(() => {})
  showNotifs.value = false
  const t = enrichedTasks.value.find(x => String(x._id) === String(n.taskId))
  if (t) openTaskDetail(t)
}

const detailTeam = computed(() => teams.value.find(t => String(t._id) === String(detailTeamId.value)) || null)
const detailTeamMemberIds = computed(() => (detailTeam.value?.teamMembers || []).map(getId))
const detailTeamTasks = computed(() => enrichedTasks.value.filter(t => String(getId(t.team)) === String(detailTeamId.value)))
const detailTeamCount = team => enrichedTasks.value.filter(t => String(getId(t.team)) === String(team._id) && taskStatus(t) !== 'Completed').length
const canManageTeam = team => !!team && (isAdmin.value || String(getId(team.addedBy)) === myId.value || teamAdminIds(team).some(a => String(getId(a)) === myId.value))

function openTeamDetail(team) {
  detailTeamId.value = team._id
  addTeamMemberForm.value = { teamId: team._id, memberIds: [], role: 'teamMember' }
  teamRemovePick.value = []
  showTeamDetail.value = true
}

async function addMembersToTeam() {
  const team = detailTeam.value
  const f = addTeamMemberForm.value
  if (!team || !f.memberIds.length) return notify('Select at least one member', true)
  const ids = [...f.memberIds]
  if (isDemoMode.value && f.role === 'teamViewer') ids.forEach(id => teamRoles.set(team._id, id, 'viewer'))

  if (isDemoMode.value) {
    team.teamMembers = team.teamMembers || []
    team.teamAdmins = team.teamAdmins || []
    members.value.filter(m => ids.includes(String(m._id)) && !detailTeamMemberIds.value.includes(m._id)).forEach(m => {
      team.teamMembers.push(m)
      if (f.role === 'teamAdmin') team.teamAdmins.push(m._id)
    })
    f.memberIds = []
    notify(`${ids.length} member(s) added to team (Demo Mode)`)
    return
  }

  await run(async () => {
    const role = f.role === 'teamAdmin' ? 'admin' : f.role === 'teamViewer' ? 'viewer' : 'editor'
    // One request: the backend accepts memberIds[] and silently skips invalid / already-added ones.
    const r = await api.addMemberToTeam({ teamId: team._id, memberIds: ids, role })
    const added = Array.isArray(r?.data?.memberIds) ? r.data.memberIds.length : ids.length
    f.memberIds = []
    await reload('teams', 'members')
    notify(bulkMessage('added', { ok: added, failed: ids.length - added }), added < ids.length)
  })
}

async function removeTeamMembers() {
  const team = detailTeam.value
  const ids = [...teamRemovePick.value]
  if (!team || !ids.length) return
  if (!confirm(`Remove ${ids.length} member(s) from ${team.name}?`)) return

  if (isDemoMode.value) {
    team.teamMembers = team.teamMembers.filter(m => !ids.includes(String(getId(m))))
    team.teamAdmins = (team.teamAdmins || []).filter(a => !ids.includes(String(getId(a))))
    teamRemovePick.value = []
    notify('Members removed (Demo Mode)')
    return
  }
  await run(async () => {
    await api.removeMemberFromTeam({ teamId: team._id, memberIds: ids })
    teamRemovePick.value = []
    await reload('teams')
    notify(`${ids.length} removed`)
  })
}

async function renameTeamInline(team, name) {
  const clean = name.trim()
  if (!clean || clean === team.name) return
  if (isDemoMode.value) { team.name = clean; return notify('Team renamed (Demo Mode)') }
  await run(async () => {
    await api.updateTeamName({ teamId: team._id, name: clean })
    await reload('teams')
  }, 'Team renamed')
}

function openAssign(task) {
  assignmentForm.value = { taskId: task._id, memberIds: [] }
  showAssignModal.value = true
}

async function removeTeamMember(team, member) {
  if (!confirm(`Remove ${getMemberName(member)} from ${team.name}?`)) return
  if (isDemoMode.value) {
    team.teamMembers = team.teamMembers.filter(m => getId(m) !== getId(member))
    team.teamAdmins = (team.teamAdmins || []).filter(a => getId(a) !== getId(member))
    notify('Member removed from team (Demo Mode)')
    return
  }
  await run(async () => {
    await api.removeMemberFromTeam({ teamId: team._id, memberId: getId(member) })
    await reload('teams')
  }, 'Member removed')
}

const teamRoleOf = (team, member) => ({ admin: 'teamAdmin', viewer: 'teamViewer', editor: 'teamMember' })[roleIn(team, member)]

// Viewer is enforced by the server (403 VIEWER_READ_ONLY); Demo Mode keeps it in the local role store.
async function changeTeamRole(team, member, pickedRole) {
  const role = pickedRole === 'teamViewer' ? 'teamMember' : pickedRole
  if (isDemoMode.value) {
    teamRoles.set(team._id, getId(member), pickedRole === 'teamViewer' ? 'viewer' : 'editor')
    const memberId = getId(member)
    if (role === 'teamAdmin') {
      if (!team.teamAdmins.includes(memberId)) team.teamAdmins.push(memberId)
    } else {
      team.teamAdmins = team.teamAdmins.filter(id => id !== memberId)
    }
    notify('Team role updated (Demo Mode)')
    return
  }
  await run(async () => {
    await api.updateMemberRoleInTeam({ teamId: team._id, memberId: getId(member), role: pickedRole === 'teamAdmin' ? 'admin' : pickedRole === 'teamViewer' ? 'viewer' : 'editor' })
    await reload('teams', 'members')
  }, 'Role updated')
}

async function createMember() {
  const issue = passwordIssue(memberForm.value.password)
  if (issue) return notify(issue, true)
  if (memberForm.value.password !== memberForm.value.confirmPassword) return notify('Passwords do not match', true)
  if (isDemoMode.value) {
    const newMem = {
      _id: 'usr_demo_' + Date.now(),
      fname: memberForm.value.fname,
      lname: memberForm.value.lname,
      email: memberForm.value.email,
      role: 'member',
      confirmed: true
    }
    members.value.push(newMem)
    showMemberModal.value = false
    memberForm.value = { fname: '', lname: '', email: '', password: '', confirmPassword: '', gender: 'male' }
    notify('Member created (Demo Mode)')
    return
  }

  await run(async () => {
    await api.createMember(memberForm.value)
    showMemberModal.value = false
    memberForm.value = { fname: '', lname: '', email: '', password: '', confirmPassword: '', gender: 'male' }
    await reload('members')
  }, 'Member invitation dispatched')
}

async function createAssignment() {
  const { taskId, memberIds } = assignmentForm.value
  if (!memberIds.length) return notify('Select at least one member', true)
  showAssignModal.value = false
  await assignMembers(taskId, [...memberIds])
}

// --- Change e-mail (password -> OTP sent to the new address) and delete account ---
const showEmailModal = ref(false)
const showDeleteModal = ref(false)
const emailForm = ref({ password: '', newEmail: '', otp: '', step: 'request' })
const deleteForm = ref({ password: '', confirm: '' })
function openEmailModal() { emailForm.value = { password: '', newEmail: '', otp: '', step: 'request' }; showEmailModal.value = true }
async function submitEmailChange() {
  const f = emailForm.value
  await run(async () => {
    if (f.step === 'request') {
      await api.changeEmail({ password: f.password, newEmail: f.newEmail.trim() })
      f.step = 'confirm'
      notify(`We sent a 6-digit code to ${f.newEmail.trim()}`)
    } else {
      await api.confirmChangeEmail({ email: f.newEmail.trim(), newEmail: f.newEmail.trim(), otp: f.otp.trim() })
      showEmailModal.value = false
      const res = await api.getProfile()
      if (res?.data) { currentUser.value = res.data; localStorage.setItem('taskverse-user', JSON.stringify(res.data)) }
      await reload('members')
      notify('Email updated')
    }
  })
}
async function submitDeleteAccount() {
  if (deleteForm.value.confirm.trim().toUpperCase() !== 'DELETE') return notify('Type DELETE to confirm', true)
  await run(async () => {
    await api.deleteAccount({ password: deleteForm.value.password })
    showDeleteModal.value = false
    clearSession(); token.value = ''; currentUser.value = null
    tasks.value = []; teams.value = []; members.value = []; assignments.value = []
    authMode.value = 'signin'
  }, 'Your account was deleted')
}

// --- Web Push (needs the production build: the service worker is not registered in dev) ---
const pushSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const pushOn = ref(false)
const pushBusy = ref(false)
const b64ToBytes = b64 => Uint8Array.from(atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
const swReady = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('The app service worker is not active (use the installed / production build).')), 3000))])
async function refreshPushState() {
  if (!pushSupported || isDemoMode.value) return
  try { pushOn.value = !!(await (await swReady()).pushManager.getSubscription()) } catch { pushOn.value = false }
}
async function togglePush() {
  pushBusy.value = true
  try {
    const reg = await swReady()
    const existing = await reg.pushManager.getSubscription()
    if (existing) {
      await api.pushUnsubscribe({ endpoint: existing.endpoint }).catch(() => {})
      await existing.unsubscribe()
      pushOn.value = false
      return notify('Push notifications turned off')
    }
    if ((await Notification.requestPermission()) !== 'granted') return notify('Notification permission was denied in the browser', true)
    const keyRes = await api.pushKey()
    const key = keyRes?.data?.publicKey || keyRes?.data?.key || keyRes?.publicKey
    if (!key) throw new Error('The server did not return a push key')
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) })
    await api.pushSubscribe(sub.toJSON())
    pushOn.value = true
    notify('Push notifications turned on')
  } catch (e) { notify(e.message || 'Could not change push notifications', true) } finally { pushBusy.value = false }
}

async function changePassword() {
  const issue = passwordIssue(passwordForm.value.newPassword)
  if (issue) return notify(issue, true)
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) return notify('Passwords do not match', true)
  if (isDemoMode.value) {
    showPasswordModal.value = false
    notify('Password updated (Demo Mode simulation)')
    return
  }
  await run(async () => {
    await api.changePassword(passwordForm.value)
    showPasswordModal.value = false
    clearSession()
    token.value = ''
    currentUser.value = null
    authMode.value = 'signin'
  }, 'Password changed. Please sign in again.')
}

async function refreshAll() {
  await run(async () => {
    await loadWorkspace()
  }, 'Workspace synchronized')
}

// Watchers
watch(activeNav, () => {
  mobileMenu.value = false
})

function onSessionExpired() {
  if (!token.value || isDemoMode.value) return
  token.value = ''
  currentUser.value = null
  tasks.value = []
  teams.value = []
  members.value = []
  assignments.value = []
  authMode.value = 'signin'
  notify('Your session expired. Please sign in again.', true)
}

onMounted(() => {
  window.addEventListener('taskverse:session-expired', onSessionExpired)
  if (token.value) {
    loadWorkspace()
  } else if (route.query.demo === '1') {
    activateDemoMode()
  }
  if (navItems.some(n => n.name === route.query.tab)) activeNav.value = route.query.tab
  if (route.query.demo) router.replace({ path: '/app' })
})

let tickTimer
watch([token, isDemoMode], syncRealtime, { immediate: true })
onMounted(() => {
  tickTimer = setInterval(() => { nowTs.value = Date.now() }, 1000)
  window.addEventListener('pagehide', flushPending)
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOnline)
})
onBeforeUnmount(() => {
  clearInterval(tickTimer)
  window.removeEventListener('pagehide', flushPending)
  window.removeEventListener('online', setOnline)
  window.removeEventListener('offline', setOnline)
  window.removeEventListener('taskverse:session-expired', onSessionExpired)
  clearTimeout(rtTimer)
  stopRealtime()
})
</script>

<template>
  <div class="app-shell">
    <!-- Liquid Ambient Aurora Orbs (Refract through Frosted Glass) -->
    <div class="ambient-bg" aria-hidden="true">
      <div class="aurora-orb orb-violet"></div>
      <div class="aurora-orb orb-pink"></div>
      <div class="aurora-orb orb-cyan"></div>
    </div>

    <!-- ==================== AUTHENTICATION SCREEN ==================== -->
    <template v-if="!token">
      <div class="auth-screen">
        <AuthPanel v-model:mode="authMode" :form="authForm" :reset="resetForm" :busy="busy" :error="error"
          @sign-in="signIn" @sign-up="signUp" @confirm="confirmSignUp" @resend="resendOtp" @forgot="requestPasswordReset" @reset="resetPassword" @demo="activateDemoMode" />
        <AppFooter :is-demo="isDemoMode" style="width: min(100%, 470px); margin-top: 18px;" />
      </div>
    </template>

    <!-- ==================== MAIN WORKSPACE ==================== -->
    <template v-else>
      <!-- SIDEBAR -->
      <aside class="sidebar" :class="{ 'sidebar-open': mobileMenu }">
        <div class="brand">
          <div class="brand-mark"><Command :size="22" stroke-width="2.5" /></div>
          <span>taskverse<span class="brand-dot">.</span></span>
          <button class="icon-btn close-menu" @click="mobileMenu = false"><X :size="18" /></button>
        </div>

        <div class="workspace-switch glass">
          <div class="workspace-icon">TF</div>
          <div class="workspace-label">
            <strong>{{ currentUser?.fname || 'My' }}'s Workspace</strong>
            <small>{{ isDemoMode ? 'Interactive Demo Mode' : 'Connected to API' }}</small>
          </div>
          <ChevronDown :size="15" />
        </div>

        <div class="nav-caption">{{ t('WORKSPACE') }}</div>
        <nav class="nav-list">
          <button
            v-for="item in navItems"
            :key="item.name"
            class="nav-item-btn"
            :class="{ 'nav-active': activeNav === item.name }"
            @click="activeNav = item.name"
          >
            <component :is="item.icon" :size="18" />
            <span>{{ t(item.name) }}</span>
            <span v-if="item.name === 'Tasks'" class="nav-count">{{ tasks.length }}</span>
            <span v-else-if="item.name === 'Teams'" class="nav-count">{{ teams.length }}</span>
          </button>
        </nav>

        <div class="sidebar-bottom">
          <!-- Demo Mode Indicator -->
          <div v-if="isDemoMode" class="demo-banner glass">
            <div>
              <strong>Demo Workspace</strong>
              <div style="font-size: 10.5px; opacity: 0.85;">Offline sample preview</div>
            </div>
            <button class="primary-btn tiny-btn" @click="toggleDemoMode" title="Exit Demo Mode">
              <X :size="14" />
            </button>
          </div>

          <button class="profile-row" @click="activeNav = 'Profile & security'">
            <div class="avatar">{{ initials(fullName) }}</div>
            <div class="profile-meta">
              <strong>{{ fullName }}</strong>
              <small>{{ currentUser?.role || 'Member' }}</small>
            </div>
            <Settings :size="17" />
          </button>
        </div>
      </aside>

      <!-- Mobile Scrim -->
      <div v-if="mobileMenu" class="mobile-scrim" @click="mobileMenu = false"></div>

      <!-- MAIN CONTENT AREA -->
      <main class="main-content">
        <!-- TOPBAR -->
        <header class="topbar">
          <button class="icon-btn mobile-menu-btn" @click="mobileMenu = true">
            <Menu :size="20" />
          </button>

          <div class="breadcrumbs">
            <span>{{ t('Workspace') }}</span>
            <ArrowRight :size="13" />
            <strong>{{ t(activeNav) }}</strong>
          </div>

          <div class="top-actions">
            <div class="hide-sm">
            <!-- Search bar -->
            <label class="search-box">
              <Search :size="16" />
              <input v-model="search" placeholder="Search tasks, teams…" />
              <kbd>/</kbd>
            </label>

            <!-- Mode Switcher (Capsule Toggle) -->
            <ThemeToggle />

            <!-- Demo Mode Toggle button -->
            <button
              class="icon-btn"
              :class="{ 'primary-btn': isDemoMode }"
              :style="isDemoMode ? 'padding: 6px 12px; width: auto; font-size: 12px;' : ''"
              @click="toggleDemoMode"
              :title="isDemoMode ? 'Exit demo mode and connect to backend' : 'Switch to demo data preview'"
            >
              <Sparkles :size="16" />
              <span v-if="isDemoMode" style="margin-left: 5px;">Demo Mode</span>
            </button>

            <!-- Refresh Workspace -->
            <button class="icon-btn" @click="refreshAll" title="Refresh workspace data">
              <RefreshCw :size="17" :class="{ 'spin-anim': loading }" />
            </button>

            <button class="icon-btn lang-btn" @click="toggleLang" :title="lang === 'ar' ? 'English' : 'العربية'">
              <Languages :size="17" /> <span>{{ lang === 'ar' ? 'EN' : 'ع' }}</span>
            </button>
            </div>

            <span class="rt-dot" :class="isDemoMode ? 'demo' : rtStatus" :title="isDemoMode ? 'Demo mode (offline data)' : rtStatus === 'live' ? 'Live: changes appear instantly' : rtStatus === 'polling' ? 'Checking for changes every 25s' : 'Offline'"></span>

            <!-- Notification bell -->
            <div class="notif-wrap">
              <button class="icon-btn" @click="showNotifs = !showNotifs" title="Notifications">
                <Bell :size="18" />
                <span v-if="unreadCount" class="notif-count">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
              </button>
              <div v-if="showNotifs" class="notif-backdrop" @click="showNotifs = false"></div>
              <div v-if="showNotifs" class="notif-panel glass-panel">
                <div class="notif-head">
                  <strong>{{ t('Notifications') }}</strong>
                  <button v-if="canDesktop && !desktopOk" class="link-btn" @click="enableDesktop"><BellRing :size="13" /> Desktop alerts</button>
                  <button class="link-btn" :disabled="!unreadCount" @click="markAllRead">{{ t('Mark all read') }}</button>
                </div>
                <div class="notif-list">
                  <button v-for="n in notifications" :key="n.id" class="notif-item" :class="[n.kind, { unread: !readNotifs.has(n.id) }]" @click="openNotification(n)">
                    <span class="notif-dot"></span>
                    <span class="notif-text"><strong>{{ n.title }}</strong><small>{{ n.sub }}</small></span>
                  </button>
                  <div v-if="!notifications.length" class="picker-empty">{{ t("You're all caught up.") }}</div>
                </div>
              </div>
            </div>

            <div class="more-wrap">
              <button class="icon-btn" title="More" @click="showMore = !showMore"><Ellipsis :size="18" /></button>
              <div v-if="showMore" class="notif-backdrop" @click="showMore = false"></div>
              <div v-if="showMore" class="more-panel glass-panel">
                <label class="search-box"><Search :size="16" /><input v-model="search" placeholder="Search tasks, teams…" /></label>
                <ThemeToggle />
                <button class="secondary-btn" @click="toggleLang(); showMore = false"><Languages :size="15" /> {{ lang === 'ar' ? 'English' : 'العربية' }}</button>
                <button class="secondary-btn" @click="toggleDemoMode(); showMore = false"><Sparkles :size="15" /> {{ isDemoMode ? 'Exit demo mode' : 'Demo mode' }}</button>
                <button class="secondary-btn" @click="refreshAll(); showMore = false"><RefreshCw :size="15" /> Refresh</button>
                <button class="secondary-btn danger-btn" @click="signOut()"><LogOut :size="15" /> Sign out</button>
              </div>
            </div>

            <!-- Sign Out -->
            <button class="icon-btn danger-btn hide-sm" title="Sign out" @click="signOut()">
              <LogOut :size="18" />
            </button>
          </div>
        </header>

        <!-- WRAPPER -->
        <div class="content-wrap">
          <!-- WELCOME ROW -->
          <section class="welcome-row">
            <div>
              <div class="eyebrow">
                <span class="live-dot"></span>
                <span>{{ isDemoMode ? 'INTERACTIVE DEMO ACTIVE' : 'LIVE WORKSPACE CONNECTED' }}</span>
              </div>
              <h1>
                {{ t('Good day,') }} <span class="gradient-text">{{ currentUser?.fname || 'Explorer' }}.</span>
              </h1>
              <p class="subtitle">{{ t('Focus on your high-impact priorities and keep team momentum high.') }}</p>
            </div>

            <div class="welcome-actions">
              <button class="secondary-btn" @click="refreshSession">
                <RefreshCw :size="16" />
                <span>{{ t('Refresh Session') }}</span>
              </button>
              <button class="primary-btn" @click="showTaskModal = true">
                <Plus :size="18" />
                <span>{{ t('Create Task') }}</span>
              </button>
            </div>
          </section>

          <!-- ==================== VIEW: OVERVIEW ==================== -->
          <template v-if="activeNav === 'Overview'">
            <!-- STATS CARDS -->
            <section v-if="dashTeam === 'all'" class="stats-grid">
              <article class="stat-card glass lavender glass-interactive">
                <div class="stat-top">
                  <span>{{ t('Total Tasks') }}</span>
                  <div class="stat-icon lavender"><ListTodo :size="20" /></div>
                </div>
                <div class="stat-value">{{ tasks.length }}</div>
                <div class="stat-foot">
                  <span>Across {{ teams.length }} active teams</span>
                </div>
              </article>

              <article class="stat-card glass blue glass-interactive">
                <div class="stat-top">
                  <span>In Progress</span>
                  <div class="stat-icon blue"><Activity :size="20" /></div>
                </div>
                <div class="stat-value">{{ inProgressCount }}</div>
                <div class="stat-foot">
                  <span>{{ t('Active momentum') }}</span>
                </div>
              </article>

              <article class="stat-card glass emerald glass-interactive">
                <div class="stat-top">
                  <span>{{ t('Completed') }}</span>
                  <div class="stat-icon emerald"><CheckCircle2 :size="20" /></div>
                </div>
                <div class="stat-value">{{ completedCount }}</div>
                <div class="stat-foot">
                  <span>{{ completionRate }}% completion velocity</span>
                </div>
                <div class="progress-track">
                  <div class="progress-bar" :style="{ width: completionRate + '%' }"></div>
                </div>
              </article>

              <article class="stat-card glass rose glass-interactive">
                <div class="stat-top">
                  <span>{{ t('Overdue / Blocked') }}</span>
                  <div class="stat-icon rose"><CalendarDays :size="20" /></div>
                </div>
                <div class="stat-value">{{ overdueCount }}</div>
                <div class="stat-foot">
                  <span>{{ overdueCount ? 'Needs attention' : 'All deadlines clear' }}</span>
                </div>
              </article>
            </section>

            <div class="ins-actions">
              <label class="scope-pick"><DashIcon :size="14" />
                <select v-model="dashTeam" title="Dashboard scope">
                  <option value="all">All teams</option>
                  <option v-for="tm in teams" :key="tm._id" :value="tm._id">{{ tm.name }}</option>
                </select>
              </label>
              <span style="flex:1"></span>
              <button class="secondary-btn tiny-btn" style="width:auto" @click="exportReportPDF(enrichedTasks)"><Download :size="14" /> Export report (PDF)</button>
              <button class="secondary-btn tiny-btn" style="width:auto" @click="exportTasksCSV(enrichedTasks)"><FileText :size="14" /> All tasks (CSV)</button>
            </div>
            <TeamDashboard
              v-if="dashTeamObj"
              :team="dashTeamObj" :tasks="dashTasks" :members="dashMembers" :status-of="taskStatus"
              :member-tasks="memberTasks" :completed-at-of="completedAtOf" :get-id="getId"
              @open="openTaskDetail"
            />
            <template v-else>
            <OverviewInsights
              :tasks="enrichedTasks" :teams="teams" :members="members" :status-of="taskStatus"
              :member-tasks="memberTasks" :activity="activity" :get-id="getId"
              @open="openTaskDetail"
            />
            <div style="margin-bottom:18px"><TimeCard :tasks="enrichedTasks" @open="openTaskDetail" /></div>
            </template>

            <!-- RECENT TASKS PANEL -->
            <section class="panel glass-panel">
              <div class="panel-heading">
                <div>
                  <div class="panel-title-line">
                    <h2>{{ t('Recent Tasks') }}</h2>
                    <span class="count-pill">{{ visibleTasks.length }}</span>
                  </div>
                  <p>Click on any checkbox or status pill to toggle task progress.</p>
                </div>
                <button class="primary-btn tiny-btn" style="padding: 8px 14px; width: auto;" @click="activeNav = 'Tasks'">
                  <span>{{ t('View all') }}</span>
                  <ArrowRight :size="15" />
                </button>
              </div>

              <div class="task-table-wrap">
                <table class="task-table">
                  <thead>
                    <tr>
                      <th>{{ t('Task') }}</th>
                      <th>{{ t('Team') }}</th>
                      <th>{{ t('Status') }}</th>
                      <th>{{ t('Start Date') }}</th>
                      <th>{{ t('Due Date') }}</th>
                      <th>{{ t('Actions') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="task in visibleTasks.slice(0, 6)" :key="task._id">
                      <td>
                        <div class="task-name-cell">
                          <button
                            class="task-check-btn"
                            :class="{ 'is-done': taskStatus(task) === 'Completed' }"
                            :disabled="!canToggle(task)"
                            @click="toggleTaskStatus(task)"
                            :title="canToggle(task) ? 'Toggle completed' : 'Only assigned members can change status'"
                          >
                            <Check v-if="taskStatus(task) === 'Completed'" :size="14" />
                          </button>
                          <div class="task-open" @click="openTaskDetail(task)" title="Open task">
                            <strong dir="auto" :class="{ strikethrough: taskStatus(task) === 'Completed' }">
                              {{ task.title }}
                            </strong>
                            <span v-if="extras.get(task._id).priority" class="prio-badge" :class="extras.get(task._id).priority"><Flag :size="10" /> {{ extras.get(task._id).priority }}</span>
                            <span v-for="tag in extras.get(task._id).tags" :key="tag" class="tag-chip" :style="tagColor(tag)">{{ tag }}</span>
                            <span v-if="extras.progress(task._id).total" class="kb-sub-inline"><ListChecks :size="11" /> {{ extras.progress(task._id).done }}/{{ extras.progress(task._id).total }}</span>
                            <small dir="auto">{{ stripRich(task.description) }}</small>
                            <small v-if="task.assignees?.length" class="assignees">Assigned to {{ task.assignees.map(getMemberName).join(', ') }}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span class="role-badge">{{ task.team?.name || 'General' }}</span>
                      </td>
                      <td>
                        <button
                          class="status-pill"
                          :class="taskStatus(task).toLowerCase().replaceAll(' ', '-')"
                          :disabled="!canToggle(task)"
                          @click="toggleTaskStatus(task)"
                          :title="canToggle(task) ? 'Click to advance status' : 'Only assigned members can change status'"
                        >
                          <span class="live-dot" style="width: 6px; height: 6px;" v-if="taskStatus(task) === 'In progress'"></span>
                          {{ t(taskStatus(task)) }}
                        </button>
                      </td>
                      <td>{{ dateLabel(task.startDate) }}</td>
                      <td>
                        <span class="due-date" :class="{ late: taskStatus(task) !== 'Completed' && task.endDate && new Date(task.endDate) < new Date(new Date().toDateString()) }">
                          <CalendarDays :size="13" />
                          {{ dateLabel(task.endDate) }}
                        </span>
                      </td>
                      <td>
                        <div class="row-actions">
                          <button class="icon-btn tiny-btn" @click="openTaskDetail(task)" title="View / edit task">
                            <Pencil :size="15" />
                          </button>
                          <button v-if="canManageTask(task)" class="icon-btn tiny-btn" @click="openAssign(task)" title="Assign task">
                            <UserPlus :size="15" />
                          </button>
                          <button v-if="canManageTask(task)" class="icon-btn tiny-btn danger-btn" :disabled="busy" @click="deleteTask(task)" title="Delete task">
                            <Trash2 :size="15" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!visibleTasks.length">
                      <td colspan="6" class="empty-state">
                        No tasks match your search. Create a task or reset the search query.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="panel-footer">
                <span>Displaying latest {{ Math.min(6, visibleTasks.length) }} of {{ tasks.length }} tasks</span>
                <button class="link-btn" @click="showTaskModal = true">
                  <Plus :size="14" /> Add task
                </button>
              </div>
            </section>
          </template>

          <!-- ==================== VIEW: TASKS ==================== -->
          <template v-else-if="activeNav === 'Tasks'">
            <section class="panel glass-panel">
              <div class="panel-heading">
                <div>
                  <div class="panel-title-line">
                    <h2>{{ t('Task Management') }}</h2>
                    <span class="count-pill">{{ visibleTasks.length }}</span>
                  </div>
                  <p>{{ t('Comprehensive tracker for all tasks across your teams.') }}</p>
                </div>

                <!-- Filters -->
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                  <button
                    class="secondary-btn tiny-btn"
                    style="width: auto; padding: 6px 12px; font-size: 12px;"
                    :class="{ 'primary-btn': taskFilter === 'all' }"
                    @click="taskFilter = 'all'"
                  >{{ t('All') }}</button>
                  <button
                    class="secondary-btn tiny-btn"
                    style="width: auto; padding: 6px 12px; font-size: 12px;"
                    :class="{ 'primary-btn': taskFilter === 'inProgress' }"
                    @click="taskFilter = 'inProgress'"
                  >{{ t('In progress') }}</button>
                  <button
                    class="secondary-btn tiny-btn"
                    style="width: auto; padding: 6px 12px; font-size: 12px;"
                    :class="{ 'primary-btn': taskFilter === 'completed' }"
                    @click="taskFilter = 'completed'"
                  >{{ t('Completed') }}</button>
                  <button
                    class="secondary-btn tiny-btn"
                    style="width: auto; padding: 6px 12px; font-size: 12px;"
                    :class="{ 'primary-btn': taskFilter === 'blocked' }"
                    @click="taskFilter = 'blocked'"
                  >{{ t('Blocked') }}</button>
                  <select v-model="taskTeamFilter" class="team-filter" title="Filter by team">
                    <option value="all">{{ t('All teams') }}</option>
                    <option v-for="team in teams" :key="team._id" :value="team._id">{{ team.name }}</option>
                  </select>
                  <button class="primary-btn" @click="showTaskModal = true">
                    <Plus :size="16" /> {{ t('New Task') }}
                  </button>
                </div>
              </div>

              <div class="tasks-toolbar">
                <div class="seg">
                  <button :class="{ on: taskViewMode === 'list' }" @click="taskViewMode = 'list'"><List :size="14" /> {{ t('List') }}</button>
                  <button :class="{ on: taskViewMode === 'board' }" @click="taskViewMode = 'board'"><Grid2X2 :size="14" /> {{ t('Board') }}</button>
                  <button :class="{ on: taskViewMode === 'calendar' }" @click="taskViewMode = 'calendar'"><CalendarDays :size="14" /> {{ t('Calendar') }}</button>
                </div>
                <span style="flex:1"></span>
                <div class="export-wrap">
                  <button class="secondary-btn tiny-btn" style="width:auto" @click="showExport = !showExport"><Download :size="14" /> Export</button>
                  <div v-if="showExport" class="notif-backdrop" @click="showExport = false"></div>
                  <div v-if="showExport" class="export-menu glass-panel">
                    <button @click="exportTasksCSV()"><FileText :size="14" /> CSV (Excel)</button>
                    <button @click="exportReportPDF()"><FileText :size="14" /> PDF report</button>
                  </div>
                </div>
                <select v-if="allTags.length" v-model="taskTagFilter" class="team-filter" :title="t('All tags')">
                  <option value="all">{{ t('All tags') }}</option>
                  <option v-for="tg in allTags" :key="tg" :value="tg">#{{ tg }}</option>
                </select>
                <select v-model="taskSort" class="team-filter" :title="t('Sort')">
                  <option value="newest">{{ t('Sort') }}: Default</option>
                  <option value="due">{{ t('Sort') }}: Due date</option>
                  <option value="priority">{{ t('Sort') }}: Priority</option>
                  <option value="status">{{ t('Sort') }}: Status</option>
                  <option value="title">{{ t('Sort') }}: Title</option>
                </select>
              </div>

              <div v-if="taskViewMode === 'list' && selectedIds.length" class="bulk-bar">
                <strong>{{ selectedIds.length }} {{ t('Selected') }}</strong>
                <span style="flex:1"></span>
                <button class="secondary-btn tiny-btn" style="width:auto" @click="bulkStatus('complete')"><Check :size="13" /> {{ t('Mark completed') }}</button>
                <button class="secondary-btn tiny-btn" style="width:auto" @click="bulkStatus('inProgress')">{{ t('Mark in progress') }}</button>
                <button class="secondary-btn tiny-btn danger-btn" style="width:auto" @click="bulkDelete"><Trash2 :size="13" /> {{ t('Delete selected') }}</button>
                <button class="secondary-btn tiny-btn" style="width:auto" @click="selectedIds = []">{{ t('Clear') }}</button>
              </div>

              <KanbanBoard v-if="taskViewMode === 'board'" :tasks="visibleTasks" :status-of="taskStatus" :can-move="canToggle" :date-label="dateLabel" @open="openTaskDetail" @move="moveTask" />
              <CalendarView v-else-if="taskViewMode === 'calendar'" :tasks="visibleTasks" :status-of="taskStatus" @open="openTaskDetail" />
              <div v-else class="task-table-wrap">
                <table class="task-table">
                  <thead>
                    <tr>
                      <th class="sel-col"><input type="checkbox" :checked="allVisibleSelected" @change="toggleSelectAll" title="Select all" /></th>
                      <th>{{ t('Task') }}</th>
                      <th>{{ t('Team') }}</th>
                      <th>{{ t('Status') }}</th>
                      <th>{{ t('Start Date') }}</th>
                      <th>{{ t('Due Date') }}</th>
                      <th>{{ t('Actions') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="task in visibleTasks" :key="task._id" :class="{ 'row-selected': selectedIds.includes(String(task._id)) }">
                      <td class="sel-col"><input type="checkbox" :value="String(task._id)" v-model="selectedIds" /></td>
                      <td>
                        <div class="task-name-cell">
                          <button
                            class="task-check-btn"
                            :class="{ 'is-done': taskStatus(task) === 'Completed' }"
                            :disabled="!canToggle(task)"
                            @click="toggleTaskStatus(task)"
                            :title="canToggle(task) ? 'Toggle completed' : 'Only assigned members can change status'"
                          >
                            <Check v-if="taskStatus(task) === 'Completed'" :size="14" />
                          </button>
                          <div class="task-open" @click="openTaskDetail(task)" title="Open task">
                            <strong dir="auto" :class="{ strikethrough: taskStatus(task) === 'Completed' }">
                              {{ task.title }}
                            </strong>
                            <span v-if="extras.get(task._id).priority" class="prio-badge" :class="extras.get(task._id).priority"><Flag :size="10" /> {{ extras.get(task._id).priority }}</span>
                            <span v-for="tag in extras.get(task._id).tags" :key="tag" class="tag-chip" :style="tagColor(tag)">{{ tag }}</span>
                            <span v-if="extras.progress(task._id).total" class="kb-sub-inline"><ListChecks :size="11" /> {{ extras.progress(task._id).done }}/{{ extras.progress(task._id).total }}</span>
                            <small dir="auto">{{ stripRich(task.description) }}</small>
                            <small v-if="task.assignees?.length" class="assignees">Assigned to {{ task.assignees.map(getMemberName).join(', ') }}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span class="role-badge">{{ task.team?.name || 'General' }}</span>
                      </td>
                      <td>
                        <button
                          class="status-pill"
                          :class="taskStatus(task).toLowerCase().replaceAll(' ', '-')"
                          :disabled="!canToggle(task)"
                          @click="toggleTaskStatus(task)"
                          :title="canToggle(task) ? 'Click to advance status' : 'Only assigned members can change status'"
                        >
                          <span class="live-dot" style="width: 6px; height: 6px;" v-if="taskStatus(task) === 'In progress'"></span>
                          {{ t(taskStatus(task)) }}
                        </button>
                      </td>
                      <td>{{ dateLabel(task.startDate) }}</td>
                      <td>
                        <span class="due-date" :class="{ late: taskStatus(task) !== 'Completed' && task.endDate && new Date(task.endDate) < new Date(new Date().toDateString()) }">
                          <CalendarDays :size="13" />
                          {{ dateLabel(task.endDate) }}
                        </span>
                      </td>
                      <td>
                        <div class="row-actions">
                          <button class="icon-btn tiny-btn" @click="openTaskDetail(task)" title="View / edit task">
                            <Pencil :size="15" />
                          </button>
                          <button v-if="canManageTask(task)" class="icon-btn tiny-btn" @click="openAssign(task)" title="Assign task">
                            <UserPlus :size="15" />
                          </button>
                          <button v-if="canManageTask(task)" class="icon-btn tiny-btn danger-btn" :disabled="busy" @click="deleteTask(task)" title="Delete task">
                            <Trash2 :size="15" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!visibleTasks.length">
                      <td colspan="7" class="empty-state">
                        {{ t('No tasks found in this view.') }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="panel-footer">
                <span>{{ visibleTasks.length }} tasks match current criteria</span>
                <button class="link-btn" @click="showTaskModal = true">
                  <Plus :size="14" /> {{ t('Create task') }}
                </button>
              </div>
            </section>
          </template>

          <!-- ==================== VIEW: TEAMS ==================== -->
          <template v-else-if="activeNav === 'Teams'">
            <section class="panel glass-panel">
              <div class="panel-heading">
                <div>
                  <div class="panel-title-line">
                    <h2>{{ t('Teams & Workgroups') }}</h2>
                    <span class="count-pill">{{ teams.length }}</span>
                  </div>
                  <p>Organize members and permissions across project domains.</p>
                </div>
                <button v-if="isAdmin" class="primary-btn" @click="openCreateTeam">
                  <Plus :size="17" /> {{ t('Create Team') }}
                </button>
              </div>

              <div class="cards-grid">
                <article v-for="team in teams" :key="team._id" class="entity-card glass glass-interactive team-card-click" @click="openTeamDetail(team)">
                  <div class="entity-card-head">
                    <div class="entity-icon"><Users :size="20" /></div>
                    <button class="icon-btn tiny-btn" @click.stop="openTeamDetail(team)" title="Open / edit team">
                      <Pencil :size="15" />
                    </button>
                  </div>

                  <h3>{{ team.name }}</h3>
                  <p>{{ team.teamMembers?.length || 0 }} members · Created {{ dateLabel(team.createdAt) }}</p>

                  <!-- Member Avatar Stack -->
                  <div class="member-avatar-row">
                    <span v-for="member in (team.teamMembers || []).slice(0, 5)" :key="getId(member)" class="mini-avatar" :title="getMemberName(member)">
                      {{ initials(getMemberName(member)) }}
                    </span>
                    <span v-if="(team.teamMembers?.length || 0) > 5" class="mini-avatar" style="background: var(--glass-panel); color: var(--text-muted);">
                      +{{ team.teamMembers.length - 5 }}
                    </span>
                  </div>

                  <p class="team-card-hint">{{ detailTeamCount(team) }} open tasks · click to manage members</p>

                  <div class="entity-actions">
                    <button class="secondary-btn" @click.stop="openTeamDashboard(team)"><DashIcon :size="14" /> Dashboard</button>
                    <button class="secondary-btn" @click.stop="openTeamDetail(team)">
                      <UserPlus :size="14" /> {{ t('Add members') }}
                    </button>
                    <button v-if="canManageTeam(team)" class="icon-btn danger-btn" @click.stop="deleteTeam(team)" title="Delete team">
                      <Trash2 :size="15" />
                    </button>
                  </div>
                </article>

                <div v-if="!teams.length" class="empty-card">
                  <Users :size="32" />
                  <h3>No teams yet</h3>
                  <p>Create your first team to assign work and collaborate.</p>
                  <button v-if="isAdmin" class="primary-btn" @click="openCreateTeam">
                    <Plus :size="16" /> {{ t('Create Team') }}
                  </button>
                </div>
              </div>
            </section>
          </template>

          <!-- ==================== VIEW: MEMBERS ==================== -->
          <template v-else-if="activeNav === 'Members'">
            <section class="panel glass-panel">
              <div class="panel-heading">
                <div>
                  <div class="panel-title-line">
                    <h2>{{ t('Directory of Members') }}</h2>
                    <span class="count-pill">{{ members.length }}</span>
                  </div>
                  <p>User accounts invited and managed by your organization.</p>
                </div>
                <button v-if="isAdmin" class="primary-btn" @click="showMemberModal = true">
                  <Plus :size="17" /> {{ t('Invite Member') }}
                </button>
              </div>

              <div class="member-list">
                <div v-for="member in visibleMembers" :key="member._id" class="member-list-row member-row-click" @click="openMemberDetail(member)">
                  <div class="avatar">{{ initials(getMemberName(member)) }}</div>
                  <div class="member-list-meta">
                    <strong>{{ getMemberName(member) }}</strong>
                    <small>{{ member.email }}</small>
                  </div>
                  <span class="role-badge">{{ member.role || 'Member' }}</span>
                  <span class="status-badge" :class="member.confirmed ? 'confirmed' : 'pending'">
                    {{ member.confirmed ? 'Confirmed' : 'Pending' }}
                  </span>
                </div>
                <div v-if="!members.length" class="empty-state">
                  No members registered yet. Send an invitation to expand your team.
                </div>
              </div>
            </section>
          </template>

          <!-- ==================== VIEW: MY ASSIGNMENTS ==================== -->
          <template v-else-if="activeNav === 'My assignments'">
            <section class="panel glass-panel">
              <div class="panel-heading">
                <div>
                  <div class="panel-title-line">
                    <h2>{{ t('Assigned to Me') }}</h2>
                    <span class="count-pill">{{ myAssignments.length }}</span>
                  </div>
                  <p>Keep track of your direct commitments and update statuses in real time.</p>
                </div>
              </div>

              <div class="assignment-grid">
                <article v-for="assignment in myAssignments" :key="assignment._id" class="assignment-card glass glass-interactive assignment-open" tabindex="0" role="button" @click="assignment.task && openTaskDetail(assignment.task)" @keydown.enter.self="assignment.task && openTaskDetail(assignment.task)">
                  <div class="assignment-top">
                    <span class="status-dot" :class="taskStatus({ myAssignment: assignment }).toLowerCase().replaceAll(' ', '-')"></span>
                    <span class="status-pill" :class="taskStatus({ myAssignment: assignment }).toLowerCase().replaceAll(' ', '-')">
                      {{ t(taskStatus({ myAssignment: assignment })) }}
                    </span>
                  </div>
                  <h3>{{ assignment.task?.title || 'Untitled Task' }}</h3>
                  <p>{{ assignment.task?.description || 'No description provided.' }}</p>

                  <div class="assignment-meta">
                    <span>
                      <CalendarDays :size="14" />
                      Due {{ dateLabel(assignment.task?.endDate) }}
                    </span>
                    <span class="role-badge">{{ assignment.task?.team?.name || 'General' }}</span>
                  </div>

                  <div class="assignment-actions" style="margin-top: auto; padding-top: 14px;">
                    <button
                      class="secondary-btn full-btn"
                      @click.stop="toggleTaskStatus({ _id: assignment.task?._id, myAssignment: assignment })"
                    >
                      <CheckSquare :size="15" /> Advance Status
                    </button>
                  </div>
                </article>

                <div v-if="!myAssignments.length" class="empty-card">
                  <ClipboardList :size="32" />
                  <h3>No assignments pending</h3>
                  <p>When an admin or team lead assigns tasks to you, they will appear here.</p>
                </div>
              </div>
            </section>
          </template>

          <!-- ==================== VIEW: PROFILE & SECURITY ==================== -->
          <template v-else-if="activeNav === 'Profile & security'">
            <section class="profile-grid">
              <!-- Profile Details -->
              <div class="panel glass-panel">
                <div class="panel-heading">
                  <div>
                    <h2>Profile Information</h2>
                    <p>Details associated with your active credentials.</p>
                  </div>
                </div>

                <div class="profile-hero">
                  <div class="avatar profile-big">{{ initials(fullName) }}</div>
                  <div>
                    <h3>{{ fullName }}</h3>
                    <p>{{ currentUser?.email }}</p>
                    <span class="role-badge">{{ currentUser?.role || 'Member' }}</span>
                  </div>
                </div>

                <div class="profile-detail">
                  <span>First Name</span>
                  <strong>{{ currentUser?.fname || '—' }}</strong>
                </div>
                <div class="profile-detail">
                  <span>Last Name</span>
                  <strong>{{ currentUser?.lname || '—' }}</strong>
                </div>
                <div class="profile-detail">
                  <span>Gender</span>
                  <strong>{{ currentUser?.gender || '—' }}</strong>
                </div>
                <div class="profile-detail">
                  <span>{{ t('Status') }}</span>
                  <strong>{{ currentUser?.confirmed ? 'Active & Confirmed' : 'Pending verification' }}</strong>
                </div>
              </div>

              <!-- Devices + notification preferences (real backend) -->
              <div v-if="!isDemoMode" class="panel glass-panel account-panel">
                <div class="panel-heading">
                  <div>
                    <h2>Devices &amp; notifications</h2>
                    <p>Where you are signed in, and which emails you receive.</p>
                  </div>
                  <BellRing :size="20" />
                </div>
                <div class="acct-block">
                  <div class="eyebrow">Signed-in devices</div>
                  <div v-for="sess in sessions" :key="sess._id" class="att-row session-row">
                    <span class="td-grow">{{ sessionLabel(sess) }} <small>· {{ fmtWhen(sess.lastUsedAt || sess.createdAt) }}</small></span>
                    <span v-if="sess.current" class="role-badge">This device</span>
                    <button v-else type="button" class="secondary-btn tiny-btn" style="width:auto" @click="revokeSession(sess)">Sign out</button>
                  </div>
                  <span v-if="!sessions.length" class="td-hint">No device list available.</span>
                </div>
                <div v-if="pushSupported" class="acct-block">
                  <div class="eyebrow">Push notifications</div>
                  <label class="pref-row">
                    <input type="checkbox" :checked="pushOn" :disabled="pushBusy" @change="togglePush" />
                    <span>Show notifications on this device, even when TaskVerse is closed</span>
                  </label>
                </div>
                <div v-if="prefs" class="acct-block">
                  <div class="eyebrow">Email notifications</div>
                  <label v-for="row in PREF_ROWS" :key="row.key" class="pref-row">
                    <input type="checkbox" :checked="prefs[row.key] !== false" @change="setPref(row.key, $event.target.checked)" />
                    <span>{{ row.label }}</span>
                  </label>
                </div>
              </div>

              <!-- Security & Preferences -->
              <div class="panel glass-panel">
                <div class="panel-heading">
                  <div>
                    <h2>Security & Appearance</h2>
                    <p>Theme choices and session control.</p>
                  </div>
                  <KeyRound :size="20" />
                </div>

                <!-- Appearance Preference -->
                <div style="padding: 18px 24px; border-bottom: 1px solid var(--glass-border);">
                  <div style="font-size: 13px; font-weight: 600; margin-bottom: 10px;">Visual Theme Mode</div>
                  <ThemeToggle />
                  <div style="font-size: 11.5px; color: var(--text-dim); margin-top: 8px;">
                    Choose Light, Dark, or System mode. Glassmorphism adapts seamlessly with frosted transparency.
                  </div>
                </div>

                <button class="settings-action" @click="showPasswordModal = true">
                  <div class="settings-action-icon"><KeyRound :size="18" /></div>
                  <div>
                    <strong>Change Password</strong>
                    <small>Update your account access credentials</small>
                  </div>
                  <ArrowRight :size="16" />
                </button>

                <button v-if="!isDemoMode" class="settings-action" @click="openEmailModal">
                  <div class="settings-action-icon"><Mail :size="18" /></div>
                  <div>
                    <strong>Change email</strong>
                    <small>Verify a new address with a code</small>
                  </div>
                  <ArrowRight :size="16" />
                </button>

                <button v-if="!isDemoMode" class="settings-action danger-action" @click="deleteForm = { password: '', confirm: '' }; showDeleteModal = true">
                  <div class="settings-action-icon"><Trash2 :size="18" /></div>
                  <div>
                    <strong>Delete my account</strong>
                    <small>Permanently remove your account</small>
                  </div>
                  <ArrowRight :size="16" />
                </button>

                <button class="settings-action" @click="refreshSession">
                  <div class="settings-action-icon"><RefreshCw :size="18" /></div>
                  <div>
                    <strong>Refresh Token</strong>
                    <small>Renew JWT access privileges</small>
                  </div>
                  <ArrowRight :size="16" />
                </button>

                <button class="settings-action" @click="signOut()">
                  <div class="settings-action-icon"><LogOut :size="18" /></div>
                  <div>
                    <strong>Sign Out</strong>
                    <small>Terminate session on this device</small>
                  </div>
                  <ArrowRight :size="16" />
                </button>

                <button class="settings-action danger-action" @click="signOut('all')">
                  <div class="settings-action-icon"><ShieldCheck :size="18" /></div>
                  <div>
                    <strong>Sign Out Everywhere</strong>
                    <small>Invalidate all active sessions across all devices</small>
                  </div>
                  <ArrowRight :size="16" />
                </button>
              </div>
            </section>
          </template>

          <!-- FOOTER WITH DEVELOPER DETAILS -->
          <AppFooter :is-demo="isDemoMode" />
        </div>
      </main>
    </template>

    <!-- ==================== MODALS ==================== -->

    <!-- CREATE TASK MODAL -->
    <Transition name="modal">
      <div v-if="showTaskModal" class="modal-backdrop" v-modal-a11y @click.self="showTaskModal = false">
        <section class="create-modal glass-panel">
          <div class="modal-heading">
            <div>
              <div class="eyebrow">NEW TASK</div>
              <h2>{{ t('Create Task') }}</h2>
              <p>Specify the work details and assign it to a team.</p>
            </div>
            <button class="icon-btn tiny-btn" @click="showTaskModal = false"><X :size="18" /></button>
          </div>

          <form @submit.prevent="createTask" class="form-stack">
            <div class="tpl-row">
              <span class="picker-label">Start from a template</span>
              <div class="tpl-chips">
                <span v-for="tpl in allTemplates" :key="tpl.id" class="tpl-chip" :class="{ on: pendingTemplate?.id === tpl.id }">
                  <button type="button" @click="applyTemplate(tpl)">{{ tpl.name }}</button>
                  <button v-if="tpl.id.length > 12" type="button" class="chip-x" title="Delete template" @click="removeTemplate(tpl)"><X :size="11" /></button>
                </span>
              </div>
              <small v-if="pendingTemplate" class="td-hint">Includes {{ pendingTemplate.subtasks?.length || 0 }} checklist items<template v-if="pendingTemplate.recurrence !== 'none'"> and repeats {{ pendingTemplate.recurrence }}</template>.</small>
            </div>
            <label>
              Task Title
              <input v-model="taskForm.title" required minlength="3" maxlength="150" placeholder="e.g., Implement Glassmorphic Navbar" />
            </label>
            <div class="rt-field">
              <span class="rt-label">{{ t('Description') }}</span>
              <RichText v-model="taskForm.description" :rows="4" :handles="allHandles" />
            </div>
            <label>
              Target Team
              <select v-model="taskForm.teamId" required>
                <option value="" disabled>Select a team</option>
                <option v-for="team in teams" :key="team._id" :value="team._id">{{ team.name }}</option>
              </select>
            </label>
            <div class="two-fields">
              <label>{{ t('Start Date') }}<input v-model="taskForm.startDate" type="date" required /></label>
              <label>{{ t('Due Date') }}<input v-model="taskForm.endDate" type="date" :min="taskForm.startDate" required /></label>
            </div>
            <div class="picker-wrap">
              <span class="picker-label">Assign to (optional)</span>
              <MemberPicker v-model="createAssignees" :items="createTeamMembers" max-height="170px" empty-text="Pick a team that has members." />
            </div>

            <div class="modal-actions">
              <button type="button" class="secondary-btn" @click="showTaskModal = false">{{ t('Cancel') }}</button>
              <button class="primary-btn" :disabled="busy">
                <Plus :size="16" /> {{ t('Create Task') }}
              </button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <!-- TASK DETAIL / EDIT CARD -->
    <Transition name="modal">
      <div v-if="showTaskDetail && detailTask" class="modal-backdrop" v-modal-a11y @click.self="showTaskDetail = false">
        <section class="create-modal task-detail glass-panel">
          <header class="td-header">
            <div class="td-head-main">
              <div class="td-badges">
                <span class="role-badge">{{ detailTask.team?.name || 'General' }}</span>
                <span class="status-pill" :class="taskStatus(detailTask).toLowerCase().replaceAll(' ', '-')">
                  <span class="live-dot" style="width: 6px; height: 6px;" v-if="taskStatus(detailTask) === 'In progress'"></span>
                  {{ t(taskStatus(detailTask)) }}
                </span>
              </div>
              <h2>{{ detailTask.title }}</h2>
              <p><CalendarDays :size="13" /> {{ dateLabel(detailTask.startDate) }} → {{ dateLabel(detailTask.endDate) }}</p>
            </div>
            <button class="icon-btn tiny-btn" @click="showTaskDetail = false"><X :size="18" /></button>
          </header>

          <form @submit.prevent="saveTaskDetail" class="form-stack">
            <div class="td-section">
              <div class="eyebrow">{{ t('STATUS') }}</div>
              <span v-if="!detailCanContribute" class="viewer-banner"><Eye :size="13" /> Viewer access — you can read this task but not change it.</span>
              <div class="td-status-row">
                <button
                  v-for="opt in STATUS_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="td-status-opt"
                  :class="[opt.value, { active: detailStatus === opt.value }]"
                  :disabled="!canToggle(detailTask)"
                  @click="detailStatus = opt.value"
                >{{ opt.label }}</button>
              </div>
              <small v-if="!canToggle(detailTask)" class="td-hint">Only members assigned to this task can change its status.</small>
            </div>

            <div class="td-section">
              <div class="eyebrow">{{ t('PRIORITY') }}</div>
              <div class="td-status-row">
                <button v-for="p in PRIORITIES" :key="p.value" type="button" class="td-status-opt prio" :class="[p.value, { active: detailExtras.priority === p.value }]" :disabled="!detailCanEdit" @click="setPriority(p.value)">
                  <Flag :size="12" /> {{ p.label }}
                </button>
              </div>
            </div>

            <div class="td-section">
              <div class="eyebrow">SCHEDULE</div>
              <div class="two-fields">
                <label><span><Repeat :size="12" /> Repeat</span>
                  <select :value="detailExtras.recurrence" :disabled="!detailCanEdit" @change="safely(() => extras.setRecurrence(detailTask._id, $event.target.value))">
                    <option v-for="r in RECURRENCES" :key="r.value" :value="r.value">{{ r.label }}</option>
                  </select>
                </label>
                <label><span><BellRing :size="12" /> Reminder</span>
                  <select :value="detailExtras.remindBefore" :disabled="!detailCanContribute" @change="safely(() => extras.setReminder(detailTask._id, $event.target.value))">
                    <option v-for="r in REMINDERS" :key="r.value" :value="r.value">{{ r.label }}</option>
                  </select>
                </label>
              </div>
              <small class="td-hint">Completing a repeating task creates the next one automatically with the dates shifted.</small>
            </div>

            <div class="td-section">
              <div class="eyebrow"><Timer :size="12" /> TIME TRACKING</div>
              <div class="time-top">
                <button type="button" class="primary-btn" :class="{ running: detailTimer }" :disabled="!detailCanContribute" @click="toggleTimer">
                  <Square v-if="detailTimer" :size="14" /><Play v-else :size="14" /> {{ detailTimer ? `Stop · ${timerElapsed}` : 'Start timer' }}
                </button>
                <label class="time-est">Estimate (hours)
                  <input type="number" min="0" step="0.25" :value="detailExtras.estimateMin ? detailExtras.estimateMin / 60 : ''" :disabled="!detailCanEdit" @change="setEstimate" />
                </label>
                <div class="time-sum"><strong>{{ fmtMinutes(detailLogged) }}</strong><small>logged<template v-if="detailExtras.estimateMin"> of {{ fmtMinutes(detailExtras.estimateMin) }}</template></small></div>
              </div>
              <div v-if="detailExtras.estimateMin" class="bar-track"><div class="bar-fill" :style="{ width: Math.min(100, detailLogged / detailExtras.estimateMin * 100) + '%', background: detailLogged > detailExtras.estimateMin ? 'var(--accent-rose)' : '' }"></div></div>
              <div class="att-list">
                <div v-for="x in detailExtras.timeEntries" :key="x.id" class="att-row">
                  <Timer :size="14" />
                  <span class="td-grow"><strong>{{ fmtMinutes(x.minutes) }}</strong> <small>{{ x.authorName }} · {{ fmtWhen(x.at) }}<template v-if="x.note && x.note !== 'Timer'"> · {{ x.note }}</template></small></span>
                  <button v-if="canDeleteOwn(x.authorId)" type="button" class="icon-btn tiny-btn danger-btn" title="Remove" @click="safely(() => extras.removeTime(detailTask._id, x.id))"><X :size="13" /></button>
                </div>
              </div>
              <div class="td-add-row">
                <input v-model="timeInput" :disabled="!detailCanContribute" placeholder="Log time: 45, 1h30m, 1.5h…" @keydown.enter.prevent="logTime" />
                <button type="button" class="secondary-btn" :disabled="!timeInput.trim() || !detailCanContribute" @click="logTime"><Timer :size="14" /> Log</button>
              </div>
            </div>

            <div class="td-section">
              <div class="eyebrow">{{ t('DETAILS') }}</div>
              <label>
                {{ t('Title') }}
                <input dir="auto" v-model="detailForm.title" required minlength="3" maxlength="150" :disabled="!detailCanEdit" />
              </label>
              <div class="rt-field">
                <span class="rt-label">{{ t('Description') }}</span>
                <RichText v-model="detailForm.description" :disabled="!detailCanEdit" :handles="allHandles" />
              </div>
              <label>
                {{ t('Team') }}
                <select v-model="detailForm.teamId" required :disabled="!detailCanEdit">
                  <option v-for="team in teams" :key="team._id" :value="String(team._id)">{{ team.name }}</option>
                </select>
              </label>
              <div class="two-fields">
                <label>{{ t('Start Date') }}<input v-model="detailForm.startDate" type="date" required :disabled="!detailCanEdit" /></label>
                <label>{{ t('Due Date') }}<input v-model="detailForm.endDate" type="date" :min="detailForm.startDate" required :disabled="!detailCanEdit" /></label>
              </div>
            </div>

            <div class="td-section">
              <div class="eyebrow">{{ t('PEOPLE') }} · {{ detailTask.assignees?.length || 0 }}</div>
              <div class="td-people">
                <span v-for="m in detailTask.assignees || []" :key="getId(m)" class="td-person">
                  <span class="avatar">{{ initials(getMemberName(m)) }}</span>
                  {{ getMemberName(m) }}
                  <button v-if="detailCanEdit" type="button" class="td-x" title="Remove from task" @click="removeAssignee(detailTask, m)"><X :size="12" /></button>
                </span>
                <span v-if="!detailTask.assignees?.length" class="td-hint">No one is assigned yet.</span>
              </div>
              <template v-if="detailCanEdit">
                <MemberPicker v-model="detailPick" :items="members" :exclude="(detailTask.assignees || []).map(getId)" max-height="180px" empty-text="Everyone is already assigned." />
                <div class="td-add-row">
                  <button type="button" class="secondary-btn" :disabled="!members.length" @click="detailPick = detailTeamPool(detailTask)">Select whole team</button>
                  <button type="button" class="primary-btn" :disabled="!detailPick.length || busy" @click="addMembersFromDetail">
                    <UserPlus :size="16" /> Assign {{ detailPick.length || '' }} selected
                  </button>
                </div>
              </template>
            </div>

            <div class="td-section">
              <div class="eyebrow">{{ t('TAGS') }}</div>
              <div class="td-people">
                <span v-for="tag in detailTags" :key="tag" class="tag-chip" :style="tagColor(tag)">
                  {{ tag }}
                  <button type="button" class="chip-x" @click="removeTag(tag)"><X :size="11" /></button>
                </span>
                <span v-if="!detailTags.length" class="td-hint">No tags yet.</span>
              </div>
              <div class="td-add-row">
                <input v-model="newTag" :disabled="!detailCanContribute" dir="auto" :placeholder="t('Add a tag…')" maxlength="24" list="tag-suggestions" @keydown.enter.prevent="addTag" />
                <datalist id="tag-suggestions"><option v-for="tg in allTags" :key="tg" :value="tg"></option></datalist>
                <button type="button" class="secondary-btn" :disabled="!newTag.trim() || !detailCanContribute" @click="addTag"><Tag :size="14" /> {{ t('Add') }}</button>
              </div>
            </div>

            <div class="td-section">
              <div class="eyebrow">{{ t('SUBTASKS') }} · {{ extras.progress(detailTask._id).done }}/{{ extras.progress(detailTask._id).total }}</div>
              <div v-if="detailSubtasks.length" class="bar-track"><div class="bar-fill" :style="{ width: (extras.progress(detailTask._id).done / extras.progress(detailTask._id).total * 100) + '%' }"></div></div>
              <div class="att-list">
                <div v-for="st in detailSubtasks" :key="st.id" class="att-row">
                  <input type="checkbox" :checked="st.done" @change="safely(() => extras.toggleSubtask(detailTask._id, st.id))" />
                  <span class="td-grow" dir="auto" :class="{ strikethrough: st.done }">{{ st.text }}</span>
                  <button type="button" class="icon-btn tiny-btn danger-btn" @click="safely(() => extras.removeSubtask(detailTask._id, st.id))"><X :size="13" /></button>
                </div>
                <span v-if="!detailSubtasks.length" class="td-hint">No subtasks yet.</span>
              </div>
              <div class="td-add-row">
                <input v-model="newSubtask" :disabled="!detailCanContribute" dir="auto" :placeholder="t('Add a subtask…')" maxlength="140" @keydown.enter.prevent="addSubtask" />
                <button type="button" class="secondary-btn" :disabled="!newSubtask.trim() || !detailCanContribute" @click="addSubtask"><ListChecks :size="14" /> {{ t('Add') }}</button>
              </div>
            </div>

            <div class="td-section">
              <div class="eyebrow">{{ t('ATTACHMENTS') }} · {{ detailExtras.attachments.length }}</div>
              <div class="att-list">
                <div v-for="a in detailExtras.attachments" :key="a.id" class="att-row">
                  <Paperclip :size="14" />
                  <span class="td-grow">{{ a.name }} <small>{{ fmtSize(a.size) }} · {{ a.authorName }}</small></span>
                  <a class="icon-btn tiny-btn" :href="a.dataUrl" :download="a.name" title="Download"><Download :size="14" /></a>
                  <button v-if="canDeleteOwn(a.authorId)" type="button" class="icon-btn tiny-btn danger-btn" title="Remove" @click="safely(() => extras.removeAttachment(detailTask._id, a.id))"><X :size="14" /></button>
                </div>
                <span v-if="!detailExtras.attachments.length" class="td-hint">No files attached.</span>
              </div>
              <input ref="fileInput" type="file" multiple hidden @change="onFilesPicked" />
              <button type="button" class="secondary-btn" :disabled="!detailCanContribute" @click="fileInput.click()"><Paperclip :size="15" /> Attach files (max 1 MB each)</button>
            </div>

            <div class="td-section">
              <div class="eyebrow">{{ t('COMMENTS') }} · {{ detailExtras.comments.length }}</div>
              <div class="cmt-list">
                <div v-for="c in detailExtras.comments" :key="c.id" class="cmt">
                  <span class="mini-avatar">{{ initials(c.authorName) }}</span>
                  <div class="td-grow">
                    <strong>{{ c.authorName }}</strong> <small>{{ fmtWhen(c.at) }}</small>
                    <div class="cmt-text" dir="auto" v-html="renderRich(c.text, allHandles)"></div>
                  </div>
                  <button v-if="canDeleteOwn(c.authorId)" type="button" class="icon-btn tiny-btn danger-btn" title="Delete comment" @click="safely(() => extras.removeComment(detailTask._id, c.id))"><X :size="13" /></button>
                </div>
                <span v-if="!detailExtras.comments.length" class="td-hint">No comments yet. Start the conversation.</span>
              </div>
              <div class="td-add-row">
                <MentionInput v-model="newComment" :members="members" :disabled="!detailCanContribute" :placeholder="t('Write a comment…')" @submit="postComment" />
                <button type="button" class="primary-btn" :disabled="!newComment.trim() || !detailCanContribute" @click="postComment"><Send :size="15" /> {{ t('Send') }}</button>
              </div>
            </div>

            <div v-if="detailActivity.length" class="td-section">
              <div class="eyebrow">{{ t('ACTIVITY') }}</div>
              <div class="act-list-sm">
                <div v-for="a in detailActivity" :key="a.id" class="act-row-sm"><strong>{{ a.actorName }}</strong> <span dir="auto">{{ a.text }}</span> <small>{{ fmtWhen(a.at) }}</small></div>
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="secondary-btn" @click="saveAsTemplate"><FileText :size="15" /> Save as template</button>
              <template v-if="!isDemoMode && detailCanEdit">
                <button v-if="!shareToken" type="button" class="secondary-btn" :disabled="busy" @click="createShare"><Link2 :size="15" /> Share link</button>
                <template v-else>
                  <button type="button" class="secondary-btn" @click="copyShare"><Link2 :size="15" /> Copy link</button>
                  <button type="button" class="secondary-btn" :disabled="busy" @click="revokeShare">Revoke link</button>
                </template>
              </template>
              <button v-if="detailCanEdit" type="button" class="secondary-btn danger-btn" :disabled="busy" @click="showTaskDetail = false; deleteTask(detailTask)">
                <Trash2 :size="16" /> {{ t('Delete') }}
              </button>
              <span style="flex: 1"></span>
              <button type="button" class="secondary-btn" @click="showTaskDetail = false">{{ t('Close') }}</button>
              <button class="primary-btn" :disabled="busy"><Check :size="16" /> {{ t('Save changes') }}</button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <!-- CREATE / RENAME TEAM MODAL -->
    <Transition name="modal">
      <div v-if="showTeamModal" class="modal-backdrop" v-modal-a11y @click.self="showTeamModal = false">
        <section class="create-modal glass-panel">
          <div class="modal-heading">
            <div>
              <div class="eyebrow">{{ t('TEAMS') }}</div>
              <h2>{{ teamEdit.teamId ? 'Rename Team' : 'Create Team' }}</h2>
              <p>Define your team space to group tasks and collaborators.</p>
            </div>
            <button class="icon-btn tiny-btn" @click="showTeamModal = false"><X :size="18" /></button>
          </div>

          <form @submit.prevent="teamEdit.teamId ? renameTeam() : createTeam()" class="form-stack">
            <label>
              Team Name
              <input v-if="teamEdit.teamId" v-model="teamEdit.name" required minlength="2" maxlength="50" placeholder="e.g. Design Systems" />
              <input v-else v-model="teamName" required minlength="2" maxlength="50" placeholder="e.g. Design Systems" />
            </label>
            <div class="modal-actions">
              <button type="button" class="secondary-btn" @click="showTeamModal = false">{{ t('Cancel') }}</button>
              <button class="primary-btn">
                <Plus :size="16" /> {{ teamEdit.teamId ? 'Save Changes' : 'Create Team' }}
              </button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <!-- MEMBER DETAIL CARD -->
    <Transition name="modal">
      <div v-if="showMemberDetail && detailMember" class="modal-backdrop" v-modal-a11y @click.self="showMemberDetail = false">
        <section class="create-modal task-detail glass-panel">
          <header class="td-header">
            <div class="td-head-main member-head">
              <div class="avatar big-avatar">{{ initials(getMemberName(detailMember)) }}</div>
              <div>
                <div class="td-badges">
                  <span class="role-badge">{{ detailMember.role || 'member' }}</span>
                  <span class="status-badge" :class="detailMember.confirmed ? 'confirmed' : 'pending'">{{ detailMember.confirmed ? 'Confirmed' : 'Pending' }}</span>
                </div>
                <h2>{{ getMemberName(detailMember) }}</h2>
                <p><Mail :size="13" /> {{ detailMember.email }}</p>
              </div>
            </div>
            <button class="icon-btn tiny-btn" @click="showMemberDetail = false"><X :size="18" /></button>
          </header>

          <div class="form-stack">
            <div class="td-section">
              <div class="eyebrow">{{ t('PROFILE') }}</div>
              <div class="kv-grid">
                <span>First name</span><strong>{{ detailMember.fname || '—' }}</strong>
                <span>Last name</span><strong>{{ detailMember.lname || '—' }}</strong>
                <span>Email</span><strong>{{ detailMember.email || '—' }}</strong>
                <span>Gender</span><strong>{{ detailMember.gender || '—' }}</strong>
                <span>System role</span><strong>{{ detailMember.role || 'member' }}</strong>
                <span>Joined</span><strong>{{ dateLabel(detailMember.createdAt) }}</strong>
              </div>
            </div>

            <div class="td-section">
              <div class="eyebrow">{{ t('TEAMS') }} · {{ memberTeams(detailMember).length }}</div>
              <div class="team-task-list">
                <button v-for="x in memberTeams(detailMember)" :key="x.team._id" type="button" class="team-task-row" @click="showMemberDetail = false; openTeamDetail(x.team)">
                  <Users :size="14" />
                  <span class="td-grow">{{ x.team.name }}</span>
                  <span class="role-badge">{{ x.role }}</span>
                </button>
                <span v-if="!memberTeams(detailMember).length" class="td-hint">Not part of any team.</span>
              </div>
            </div>

            <div class="td-section">
              <div class="eyebrow">{{ t('TASKS') }} · {{ memberTasks(detailMember).length }}</div>
              <div class="team-task-list">
                <button v-for="x in memberTasks(detailMember)" :key="x.task._id" type="button" class="team-task-row" @click="showMemberDetail = false; openTaskDetail(x.task)">
                  <span class="td-grow">{{ x.task.title }} <small>· {{ x.task.team?.name || 'General' }}</small></span>
                  <span class="status-pill" :class="taskStatus({ status: x.status }).toLowerCase().replaceAll(' ', '-')">{{ t(taskStatus({ status: x.status })) }}</span>
                </button>
                <span v-if="!memberTasks(detailMember).length" class="td-hint">No tasks assigned.</span>
              </div>
            </div>

            <div v-if="canEditMember(detailMember) || canAdminMember(detailMember)" class="td-section">
              <div class="eyebrow">{{ t('MANAGE') }}</div>
              <div v-if="canEditMember(detailMember)" class="td-add-row">
                <input v-model="memberEdit.fname" placeholder="First name" maxlength="50" />
                <input v-model="memberEdit.lname" placeholder="Last name" maxlength="50" />
                <button type="button" class="secondary-btn" :disabled="busy" @click="saveMemberName"><Check :size="15" /> {{ t('Save changes') }}</button>
              </div>
              <div v-if="canAdminMember(detailMember)" class="td-add-row member-admin-row">
                <button type="button" class="secondary-btn" :disabled="busy" @click="toggleMemberActive">{{ memberActive(detailMember) ? 'Deactivate' : 'Activate' }}</button>
                <button type="button" class="secondary-btn" :disabled="busy" @click="resetMemberPassword"><KeyRound :size="15" /> Reset password</button>
                <span style="flex:1"></span>
                <button type="button" class="secondary-btn danger-btn" :disabled="busy" @click="removeMember"><Trash2 :size="15" /> Delete member</button>
              </div>
              <span v-if="!memberActive(detailMember)" class="viewer-banner">This account is deactivated.</span>
            </div>

            <div class="modal-actions">
              <span style="flex:1"></span>
              <button type="button" class="secondary-btn" @click="showMemberDetail = false">{{ t('Close') }}</button>
            </div>
          </div>
        </section>
      </div>
    </Transition>

    <!-- TEAM DETAIL CARD -->
    <Transition name="modal">
      <div v-if="showTeamDetail && detailTeam" class="modal-backdrop" v-modal-a11y @click.self="showTeamDetail = false">
        <section class="create-modal task-detail glass-panel">
          <header class="td-header">
            <div class="td-head-main">
              <div class="td-badges">
                <span class="role-badge">{{ detailTeam.teamMembers?.length || 0 }} members</span>
                <span class="role-badge">{{ detailTeamTasks.length }} tasks</span>
              </div>
              <h2>{{ detailTeam.name }}</h2>
              <p><CalendarDays :size="13" /> Created {{ dateLabel(detailTeam.createdAt) }}</p>
            </div>
            <button class="icon-btn tiny-btn" @click="showTeamDetail = false"><X :size="18" /></button>
          </header>

          <div class="form-stack">
            <div v-if="canManageTeam(detailTeam)" class="td-section">
              <div class="eyebrow">{{ t('TEAM NAME') }}</div>
              <div class="td-add-row">
                <input :value="detailTeam.name" maxlength="80" @change="renameTeamInline(detailTeam, $event.target.value)" />
              </div>
            </div>

            <div class="td-section">
              <div class="eyebrow">{{ t('MEMBERS') }} · {{ detailTeam.teamMembers?.length || 0 }}</div>
              <div v-if="detailTeam.teamMembers?.length" class="team-members-list">
                <div v-for="member in detailTeam.teamMembers" :key="getId(member)" class="team-member-row">
                  <label v-if="canManageTeam(detailTeam) && getId(member) !== getId(detailTeam.addedBy)" class="td-check">
                    <input type="checkbox" :value="String(getId(member))" v-model="teamRemovePick" />
                  </label>
                  <span class="td-grow">{{ getMemberName(member) }}</span>
                  <select
                    :disabled="!canManageTeam(detailTeam)"
                    :value="teamRoleOf(detailTeam, member)"
                    @change="changeTeamRole(detailTeam, member, $event.target.value)"
                  >
                    <option value="teamViewer">Viewer</option>
                    <option value="teamMember">Editor</option>
                    <option value="teamAdmin">Admin</option>
                  </select>
                </div>
              </div>
              <span v-else class="td-hint">No members yet.</span>
              <div v-if="canManageTeam(detailTeam) && (detailTeam.teamMembers?.length || 0) > 1" class="td-add-row">
                <button type="button" class="secondary-btn tiny-btn" style="width:auto" @click="teamRemovePick = detailTeam.teamMembers.map(getId).filter(id => id !== getId(detailTeam.addedBy)).map(String)">{{ t('Select all') }}</button>
                <button type="button" class="secondary-btn tiny-btn" style="width:auto" :disabled="!teamRemovePick.length" @click="teamRemovePick = []">{{ t('Clear') }}</button>
                <span style="flex:1"></span>
                <button type="button" class="secondary-btn danger-btn" :disabled="!teamRemovePick.length || busy" @click="removeTeamMembers">
                  <Trash2 :size="15" /> Remove {{ teamRemovePick.length || '' }} selected
                </button>
              </div>
            </div>

            <div v-if="canManageTeam(detailTeam)" class="td-section">
              <div class="eyebrow">{{ t('ADD MEMBERS') }}</div>
              <MemberPicker v-model="addTeamMemberForm.memberIds" :items="members" :exclude="detailTeamMemberIds" empty-text="Everyone is already in this team." />
              <div class="td-add-row">
                <select v-model="addTeamMemberForm.role">
                  <option value="teamViewer">As Viewer (read-only)</option>
                  <option value="teamMember">As Editor</option>
                  <option value="teamAdmin">As Team Admin</option>
                </select>
                <button type="button" class="primary-btn" :disabled="!addTeamMemberForm.memberIds.length || busy" @click="addMembersToTeam">
                  <UserPlus :size="16" /> Add {{ addTeamMemberForm.memberIds.length || '' }} selected
                </button>
              </div>
            </div>

            <div class="td-section">
              <div class="eyebrow">{{ t('TASKS') }} · {{ detailTeamTasks.length }}</div>
              <div class="team-task-list">
                <button v-for="tk in detailTeamTasks" :key="tk._id" type="button" class="team-task-row" @click="showTeamDetail = false; openTaskDetail(tk)">
                  <span class="td-grow">{{ tk.title }}</span>
                  <span class="status-pill" :class="taskStatus(tk).toLowerCase().replaceAll(' ', '-')">{{ t(taskStatus(tk)) }}</span>
                </button>
                <span v-if="!detailTeamTasks.length" class="td-hint">No tasks in this team yet.</span>
              </div>
              <button type="button" class="secondary-btn" @click="taskForm.teamId = detailTeam._id; showTeamDetail = false; showTaskModal = true">
                <Plus :size="15" /> New task for this team
              </button>
            </div>

            <div class="modal-actions">
              <button v-if="canManageTeam(detailTeam)" type="button" class="secondary-btn danger-btn" :disabled="busy" @click="showTeamDetail = false; deleteTeam(detailTeam)">
                <Trash2 :size="16" /> {{ t('Delete team') }}
              </button>
              <span style="flex:1"></span>
              <button type="button" class="secondary-btn" @click="showTeamDetail = false">{{ t('Close') }}</button>
            </div>
          </div>
        </section>
      </div>
    </Transition>

    <!-- CREATE MEMBER MODAL -->
    <Transition name="modal">
      <div v-if="showMemberModal" class="modal-backdrop" v-modal-a11y @click.self="showMemberModal = false">
        <section class="create-modal glass-panel">
          <div class="modal-heading">
            <div>
              <div class="eyebrow">DIRECTORY</div>
              <h2>{{ t('Invite Member') }}</h2>
              <p>An automated invitation email will be issued by the backend.</p>
            </div>
            <button class="icon-btn tiny-btn" @click="showMemberModal = false"><X :size="18" /></button>
          </div>

          <form @submit.prevent="createMember" class="form-stack">
            <div class="two-fields">
              <label>First Name<input v-model="memberForm.fname" required minlength="2" /></label>
              <label>Last Name<input v-model="memberForm.lname" required minlength="2" /></label>
            </div>
            <label>Email<input v-model="memberForm.email" type="email" required /></label>
            <label>
              Gender
              <select v-model="memberForm.gender">
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>
            <label>
              Initial Temporary Password
              <input v-model="memberForm.password" type="password" required minlength="8" placeholder="Upper, lower, number, symbol" />
            </label>
            <label>
              Confirm Password
              <input v-model="memberForm.confirmPassword" type="password" required />
            </label>

            <div class="modal-actions">
              <button type="button" class="secondary-btn" @click="showMemberModal = false">{{ t('Cancel') }}</button>
              <button class="primary-btn"><UserPlus :size="16" /> {{ t('Invite Member') }}</button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <!-- ASSIGN TASK MODAL -->
    <Transition name="modal">
      <div v-if="showAssignModal" class="modal-backdrop" v-modal-a11y @click.self="showAssignModal = false">
        <section class="create-modal glass-panel">
          <div class="modal-heading">
            <div>
              <div class="eyebrow">ASSIGNMENT</div>
              <h2>Assign Task</h2>
              <p>Delegate responsibility to a team member.</p>
            </div>
            <button class="icon-btn tiny-btn" @click="showAssignModal = false"><X :size="18" /></button>
          </div>

          <form @submit.prevent="createAssignment" class="form-stack">
            <label>
              {{ t('Task') }}
              <select v-model="assignmentForm.taskId" required @change="assignmentForm.memberIds = []">
                <option value="" disabled>Select task</option>
                <option v-for="task in tasks" :key="task._id" :value="task._id">{{ task.title }}</option>
              </select>
            </label>
            <div class="picker-wrap">
              <span class="picker-label">{{ t('Members') }}</span>
              <MemberPicker
                v-model="assignmentForm.memberIds"
                :items="members"
                :exclude="(enrichedTasks.find(t => t._id === assignmentForm.taskId)?.assignees || []).map(getId)"
                empty-text="Everyone is already assigned."
              />
              <button type="button" class="secondary-btn tiny-btn" style="width:auto;align-self:flex-start" :disabled="!assignmentForm.taskId"
                @click="assignmentForm.memberIds = detailTeamPool(enrichedTasks.find(t => t._id === assignmentForm.taskId) || {})">
                Select whole team
              </button>
            </div>

            <div class="modal-actions">
              <button type="button" class="secondary-btn" @click="showAssignModal = false">{{ t('Cancel') }}</button>
              <button class="primary-btn" :disabled="!assignmentForm.memberIds.length || busy"><UserPlus :size="16" /> Assign {{ assignmentForm.memberIds.length || '' }}</button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <!-- CHANGE PASSWORD MODAL -->
    <Transition name="modal">
      <div v-if="showPasswordModal" class="modal-backdrop" v-modal-a11y @click.self="showPasswordModal = false">
        <section class="create-modal glass-panel">
          <div class="modal-heading">
            <div>
              <div class="eyebrow">SECURITY</div>
              <h2>Change Password</h2>
              <p>Enter your current password and your new credentials.</p>
            </div>
            <button class="icon-btn tiny-btn" @click="showPasswordModal = false"><X :size="18" /></button>
          </div>

          <form @submit.prevent="changePassword" class="form-stack">
            <label>Current Password<input v-model="passwordForm.oldPassword" type="password" required /></label>
            <label>New Password<input v-model="passwordForm.newPassword" type="password" required minlength="8" /></label>
            <label>Confirm New Password<input v-model="passwordForm.confirmPassword" type="password" required minlength="8" /></label>

            <div class="modal-actions">
              <button type="button" class="secondary-btn" @click="showPasswordModal = false">{{ t('Cancel') }}</button>
              <button class="primary-btn"><KeyRound :size="16" /> Update Password</button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <Transition name="modal">
      <div v-if="showEmailModal" class="modal-backdrop" v-modal-a11y @click.self="showEmailModal = false">
        <section class="create-modal glass-panel">
          <div class="modal-heading">
            <div>
              <div class="eyebrow">SECURITY</div>
              <h2>Change email</h2>
              <p v-if="emailForm.step === 'request'">Enter your password and the new address. We will email a code to it.</p>
              <p v-else>Enter the 6-digit code sent to {{ emailForm.newEmail }}.</p>
            </div>
            <button class="icon-btn tiny-btn" aria-label="Close" @click="showEmailModal = false"><X :size="18" /></button>
          </div>
          <form @submit.prevent="submitEmailChange" class="form-stack">
            <template v-if="emailForm.step === 'request'">
              <label>New email<input v-model="emailForm.newEmail" type="email" required autocomplete="email" /></label>
              <label>Current password<input v-model="emailForm.password" type="password" required autocomplete="current-password" /></label>
            </template>
            <label v-else>6-digit code<input v-model="emailForm.otp" required inputmode="numeric" minlength="6" maxlength="6" /></label>
            <div class="modal-actions">
              <button type="button" class="secondary-btn" @click="showEmailModal = false">{{ t('Cancel') }}</button>
              <button class="primary-btn" :disabled="busy"><Mail :size="16" /> {{ emailForm.step === 'request' ? 'Send code' : 'Confirm email' }}</button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <Transition name="modal">
      <div v-if="showDeleteModal" class="modal-backdrop" v-modal-a11y @click.self="showDeleteModal = false">
        <section class="create-modal glass-panel">
          <div class="modal-heading">
            <div>
              <div class="eyebrow">DANGER ZONE</div>
              <h2>Delete my account</h2>
              <p>This cannot be undone. You leave every team and your tasks are unassigned.</p>
            </div>
            <button class="icon-btn tiny-btn" aria-label="Close" @click="showDeleteModal = false"><X :size="18" /></button>
          </div>
          <form @submit.prevent="submitDeleteAccount" class="form-stack">
            <label>Current password<input v-model="deleteForm.password" type="password" required autocomplete="current-password" /></label>
            <label>Type DELETE to confirm<input v-model="deleteForm.confirm" required placeholder="DELETE" autocomplete="off" /></label>
            <div class="modal-actions">
              <button type="button" class="secondary-btn" @click="showDeleteModal = false">{{ t('Cancel') }}</button>
              <button class="primary-btn danger-solid" :disabled="busy || deleteForm.confirm.trim().toUpperCase() !== 'DELETE'"><Trash2 :size="16" /> Delete account</button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <!-- TOAST NOTIFICATION -->
    <div v-if="!online" class="offline-banner" role="alert">You are offline. Changes will not be saved until the connection returns.</div>
    <Transition name="fade">
      <div v-if="undoToast" class="undo-toast glass-panel" role="status">
        <span>{{ undoToast.message }}</span>
        <button class="undo-btn" @click="undoToast.entry.undo()"><Undo2 :size="14" /> Undo</button>
        <button class="icon-btn tiny-btn" aria-label="Dismiss" @click="undoToast.entry.finish()"><X :size="14" /></button>
      </div>
    </Transition>
    <AppToast :message="toast" :is-error="Boolean(error)" @dismiss="toast = ''; error = ''" />
  </div>
</template>
