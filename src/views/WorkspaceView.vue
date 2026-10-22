<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  Activity, ArrowRight, Bell, CalendarDays, Check, CheckCircle2,
  ChevronDown, ClipboardList, Command, Grid2X2, LayoutDashboard,
  ListTodo, LogOut, Menu, Moon, Plus, Search, Settings, ShieldCheck, Sun,
  Users, X, Zap, RefreshCw, UserRound, KeyRound, Mail, Trash2, Pencil, UserPlus,
  Sparkles, CheckSquare, Clock, Filter, AlertCircle, Laptop, ArrowLeft
} from 'lucide-vue-next'
import { api, clearSession, setSession } from '../services/api.js'
import { demoUser, demoTeams, demoMembers, demoTasks, demoAssignments } from '../services/demoData.js'
import AppToast from '../components/AppToast.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import AppFooter from '../components/AppFooter.vue'

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
const addTeamMemberForm = ref({ teamId: '', memberId: '', role: 'teamMember' })
const memberForm = ref({ fname: '', lname: '', email: '', password: '', confirmPassword: '', gender: 'male' })
const assignmentForm = ref({ taskId: '', memberId: '' })
const passwordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })

// Modal visibility
const showTaskModal = ref(false)
const showTeamModal = ref(false)
const showMemberModal = ref(false)
const showAssignModal = ref(false)
const showTeamMemberModal = ref(false)
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
  return 'To do'
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

const myAssignments = computed(() => isDemoMode.value
  ? assignments.value
  : assignments.value.filter(a => String(getId(a.member)) === myId.value))

const canToggle = task => isDemoMode.value || !!task.myAssignment

// Mirrors the backend rule: system admin, task creator, or owner/admin of the task's team.
const canManageTask = task => {
  if (isAdmin.value) return true
  if (String(getId(task.createdBy)) === myId.value) return true
  const team = teams.value.find(t => String(t._id) === String(getId(task.team)))
  return !!team && (String(getId(team.addedBy)) === myId.value || teamAdminIds(team).some(a => String(getId(a)) === myId.value))
}

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
const passwordIssue = pw => PASSWORD_RE.test(pw || '') ? '' : 'Password must be 8+ characters with upper and lower case letters, a number and one of @ $ ! % * ? &'

const visibleTasks = computed(() => {
  return enrichedTasks.value.filter(t => {
    const matchesSearch = `${t.title} ${t.description} ${t.team?.name || ''}`.toLowerCase().includes(search.value.toLowerCase())
    if (!matchesSearch) return false
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
    if (taskRes.status === 'fulfilled') tasks.value = Array.isArray(taskRes.value?.data) ? taskRes.value.data : []
    if (teamRes.status === 'fulfilled') teams.value = Array.isArray(teamRes.value?.data) ? teamRes.value.data : []
    if (memberRes.status === 'fulfilled') members.value = Array.isArray(memberRes.value?.data) ? memberRes.value.data : []
    if (assignmentRes.status === 'fulfilled') assignments.value = Array.isArray(assignmentRes.value?.data) ? assignmentRes.value.data : []

    if (!teams.value.some(t => String(t._id) === String(taskForm.value.teamId))) {
      taskForm.value.teamId = teams.value[0]?._id || ''
    }
  } catch (e) {
    notify(e.message, true)
  } finally {
    loading.value = false
  }
}

const asArray = res => Array.isArray(res?.data) ? res.data : []
const loaders = {
  tasks: async () => { tasks.value = asArray(await api.tasks()) },
  teams: async () => { teams.value = asArray(await api.teams()) },
  members: async () => { members.value = asArray(await api.members()) },
  assignments: async () => { assignments.value = asArray(await api.assignments()) },
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
    tasks.value.unshift(newTask)
    showTaskModal.value = false
    taskForm.value.title = ''
    taskForm.value.description = ''
    notify('Task created (Demo Mode)')
    return
  }

  await run(async () => {
    await api.createTask(taskForm.value)
    showTaskModal.value = false
    taskForm.value.title = ''
    taskForm.value.description = ''
    await reload('tasks')
  }, 'Task created successfully')
}

async function deleteTask(task) {
  if (!confirm(`Delete task "${task.title}"? This will also remove its assignments and cannot be undone.`)) return

  const removeLocally = () => {
    tasks.value = tasks.value.filter(t => String(t._id) !== String(task._id))
    assignments.value = assignments.value.filter(a => String(getId(a.task)) !== String(task._id))
  }

  if (isDemoMode.value) {
    removeLocally()
    notify('Task deleted (Demo Mode)')
    return
  }

  await run(async () => {
    await api.deleteTask(task._id)
    removeLocally()
  }, 'Task deleted successfully')
}

async function toggleTaskStatus(task) {
  const current = taskStatus(task)
  const nextStatus = current === 'Completed' ? 'inProgress' : current === 'In progress' ? 'complete' : 'inProgress'

  if (isDemoMode.value) {
    task.status = nextStatus
    if (task.myAssignment) task.myAssignment.status = nextStatus
    notify(`Status updated to ${nextStatus === 'complete' ? 'Completed' : 'In progress'}`)
    return
  }

  const assignment = task.myAssignment
  if (!assignment) return notify('Only members assigned to a task can change its status', true)

  await run(async () => {
    await api.updateTaskStatus({ taskId: task._id, status: nextStatus })
    assignment.status = nextStatus
    assignment.completedAt = nextStatus === 'complete' ? new Date().toISOString() : null
  }, 'Task status updated')
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
  await run(async () => {
    await api.deleteTeam({ teamId: team._id })
    await reload('teams', 'tasks')
  }, 'Team deleted')
}

async function openTeamMembers(team) {
  addTeamMemberForm.value = { teamId: team._id, memberId: '', role: 'teamMember' }
  showTeamMemberModal.value = true
}

async function addMemberToTeam() {
  if (isDemoMode.value) {
    const t = teams.value.find(item => item._id === addTeamMemberForm.value.teamId)
    const m = members.value.find(item => item._id === addTeamMemberForm.value.memberId)
    if (t && m && !t.teamMembers.some(mem => mem._id === m._id)) {
      t.teamMembers.push(m)
      if (addTeamMemberForm.value.role === 'teamAdmin') {
        t.teamAdmins.push(m._id)
      }
    }
    showTeamMemberModal.value = false
    notify('Member added to team (Demo Mode)')
    return
  }

  await run(async () => {
    await api.addMemberToTeam({ ...addTeamMemberForm.value, role: addTeamMemberForm.value.role === 'teamAdmin' ? 'admin' : 'member' })
    showTeamMemberModal.value = false
    await reload('teams')
  }, 'Member added to team')
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

async function changeTeamRole(team, member, role) {
  if (isDemoMode.value) {
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
    await api.updateMemberRoleInTeam({ teamId: team._id, memberId: getId(member), role: role === 'teamAdmin' ? 'admin' : 'member' })
    await reload('teams')
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
  if (isDemoMode.value) {
    const t = tasks.value.find(item => item._id === assignmentForm.value.taskId)
    const m = members.value.find(item => item._id === assignmentForm.value.memberId)
    if (t) {
      t.myAssignment = { _id: 'asg_' + Date.now(), status: 'inProgress' }
      assignments.value.push({ _id: 'asg_' + Date.now(), status: 'inProgress', task: t })
    }
    showAssignModal.value = false
    notify(`Task assigned to ${getMemberName(m)} (Demo Mode)`)
    return
  }

  await run(async () => {
    await api.addMemberToTask(assignmentForm.value)
    showAssignModal.value = false
    await reload('assignments')
  }, 'Task assigned successfully')
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
  if (route.query.demo) router.replace({ path: '/app' })
})

onBeforeUnmount(() => window.removeEventListener('taskverse:session-expired', onSessionExpired))
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
        <section class="auth-card glass-panel">
          <RouterLink to="/" class="back-home"><ArrowLeft :size="14" /> Back to home</RouterLink>
          <div class="brand auth-brand">
            <div class="brand-mark"><Command :size="22" stroke-width="2.5" /></div>
            <span>taskverse<span class="brand-dot">.</span></span>
          </div>

          <div class="auth-kicker">
            <span class="live-dot"></span> TEAMWORK, ELEVATED IN GLASS
          </div>

          <!-- SIGN IN FORM -->
          <template v-if="authMode === 'signin'">
            <h1>Welcome back<span class="brand-dot">.</span></h1>
            <p class="muted">Access your workspace, projects, and active teams.</p>

            <form @submit.prevent="signIn" class="form-stack">
              <label>
                Email address
                <input v-model="authForm.email" type="email" required autocomplete="email" placeholder="alex@company.com" />
              </label>
              <label>
                Password
                <input v-model="authForm.password" type="password" required autocomplete="current-password" placeholder="••••••••" />
              </label>
              <button class="primary-btn full-btn" :disabled="busy">
                <span>{{ busy ? 'Authenticating…' : 'Sign in to Workspace' }}</span>
                <ArrowRight :size="17" />
              </button>
            </form>

            <button class="link-btn centered" @click="authMode = 'forgot'">Forgot your password?</button>

            <div class="auth-divider"><span></span> EXPLORE OR CREATE <span></span></div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              <button class="secondary-btn full-btn" @click="activateDemoMode">
                <Sparkles :size="16" style="color: var(--primary);" />
                <span>Explore Interactive Demo Mode</span>
              </button>
              <button class="secondary-btn full-btn" @click="authMode = 'signup'">
                <span>Create a new admin account</span>
              </button>
            </div>
          </template>

          <!-- SIGN UP FORM -->
          <template v-else-if="authMode === 'signup'">
            <h1>Create workspace<span class="brand-dot">.</span></h1>
            <p class="muted">Start coordinating your projects in luminous style.</p>

            <form @submit.prevent="signUp" class="form-stack">
              <div class="two-fields">
                <label>First name<input v-model="authForm.fname" required minlength="2" placeholder="Alex" /></label>
                <label>Last name<input v-model="authForm.lname" required minlength="2" placeholder="Vance" /></label>
              </div>
              <label>Email address<input v-model="authForm.email" type="email" required placeholder="alex@company.com" /></label>
              <label>
                Gender
                <select v-model="authForm.gender">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <label>Password<input v-model="authForm.password" type="password" required minlength="8" placeholder="Upper, lower, number, @$!%*?&" /></label>
              <label>Confirm password<input v-model="authForm.confirmPassword" type="password" required placeholder="Repeat password" /></label>
              <button class="primary-btn full-btn" :disabled="busy">
                <span>Create account</span>
                <ArrowRight :size="17" />
              </button>
            </form>
            <button class="link-btn centered" @click="authMode = 'signin'">Already have an account? Sign in</button>
          </template>

          <!-- OTP CONFIRMATION -->
          <template v-else-if="authMode === 'confirm'">
            <h1>Verify your email<span class="brand-dot">.</span></h1>
            <p class="muted">Enter the 6-digit confirmation code sent to {{ authForm.email }}.</p>
            <form @submit.prevent="confirmSignUp" class="form-stack">
              <label>
                6-digit Code
                <input v-model="authForm.otp" required inputmode="numeric" minlength="6" maxlength="6" placeholder="123456" />
              </label>
              <button class="primary-btn full-btn">Verify and Continue</button>
            </form>
            <button class="link-btn centered" @click="resendOtp">Resend code</button>
            <button class="link-btn centered" @click="authMode = 'signin'">Back to sign in</button>
          </template>

          <!-- FORGOT PASSWORD -->
          <template v-else-if="authMode === 'forgot'">
            <h1>Reset password<span class="brand-dot">.</span></h1>
            <p class="muted">We will send a one-time verification code to your email.</p>
            <form @submit.prevent="requestPasswordReset" class="form-stack">
              <label>Email address<input v-model="resetForm.email" type="email" required placeholder="alex@company.com" /></label>
              <button class="primary-btn full-btn">Send verification code</button>
            </form>
            <button class="link-btn centered" @click="authMode = 'signin'">Back to sign in</button>
          </template>

          <!-- RESET PASSWORD -->
          <template v-else-if="authMode === 'reset'">
            <h1>New password<span class="brand-dot">.</span></h1>
            <form @submit.prevent="resetPassword" class="form-stack">
              <label>Email address<input v-model="resetForm.email" type="email" required /></label>
              <label>Verification Code<input v-model="resetForm.otp" required minlength="6" maxlength="6" /></label>
              <label>New password<input v-model="resetForm.password" type="password" required minlength="8" /></label>
              <label>Confirm new password<input v-model="resetForm.confirmPassword" type="password" required minlength="8" /></label>
              <button class="primary-btn full-btn">Save new password</button>
            </form>
            <button class="link-btn centered" @click="authMode = 'signin'">Back to sign in</button>
          </template>

          <p class="auth-error" v-if="error">{{ error }}</p>

          <div class="auth-bottom">
            <ShieldCheck :size="15" /> Protected by TaskVerse JWT & Rate-Limiter Engine
          </div>
        </section>
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

        <div class="nav-caption">WORKSPACE</div>
        <nav class="nav-list">
          <button
            v-for="item in navItems"
            :key="item.name"
            class="nav-item-btn"
            :class="{ 'nav-active': activeNav === item.name }"
            @click="activeNav = item.name"
          >
            <component :is="item.icon" :size="18" />
            <span>{{ item.name }}</span>
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
            <span>Workspace</span>
            <ArrowRight :size="13" />
            <strong>{{ activeNav }}</strong>
          </div>

          <div class="top-actions">
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

            <!-- Notification bell -->
            <button class="icon-btn" @click="notify('All systems running smoothly.')" title="Notifications">
              <Bell :size="18" />
            </button>

            <!-- Sign Out -->
            <button class="icon-btn danger-btn" title="Sign out" @click="signOut()">
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
                Good day, <span class="gradient-text">{{ currentUser?.fname || 'Explorer' }}.</span>
              </h1>
              <p class="subtitle">Focus on your high-impact priorities and keep team momentum high.</p>
            </div>

            <div class="welcome-actions">
              <button class="secondary-btn" @click="refreshSession">
                <RefreshCw :size="16" />
                <span>Refresh Session</span>
              </button>
              <button class="primary-btn" @click="showTaskModal = true">
                <Plus :size="18" />
                <span>Create Task</span>
              </button>
            </div>
          </section>

          <!-- ==================== VIEW: OVERVIEW ==================== -->
          <template v-if="activeNav === 'Overview'">
            <!-- STATS CARDS -->
            <section class="stats-grid">
              <article class="stat-card glass lavender glass-interactive">
                <div class="stat-top">
                  <span>Total Tasks</span>
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
                  <span>Active momentum</span>
                </div>
              </article>

              <article class="stat-card glass emerald glass-interactive">
                <div class="stat-top">
                  <span>Completed</span>
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
                  <span>Overdue / Blocked</span>
                  <div class="stat-icon rose"><CalendarDays :size="20" /></div>
                </div>
                <div class="stat-value">{{ overdueCount }}</div>
                <div class="stat-foot">
                  <span>{{ overdueCount ? 'Needs attention' : 'All deadlines clear' }}</span>
                </div>
              </article>
            </section>

            <!-- RECENT TASKS PANEL -->
            <section class="panel glass-panel">
              <div class="panel-heading">
                <div>
                  <div class="panel-title-line">
                    <h2>Recent Tasks</h2>
                    <span class="count-pill">{{ visibleTasks.length }}</span>
                  </div>
                  <p>Click on any checkbox or status pill to toggle task progress.</p>
                </div>
                <button class="primary-btn tiny-btn" style="padding: 8px 14px; width: auto;" @click="activeNav = 'Tasks'">
                  <span>View all</span>
                  <ArrowRight :size="15" />
                </button>
              </div>

              <div class="task-table-wrap">
                <table class="task-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Team</th>
                      <th>Status</th>
                      <th>Start Date</th>
                      <th>Due Date</th>
                      <th>Actions</th>
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
                          <div>
                            <strong :class="{ strikethrough: taskStatus(task) === 'Completed' }">
                              {{ task.title }}
                            </strong>
                            <small>{{ task.description }}</small>
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
                          {{ taskStatus(task) }}
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
                          <button v-if="canManageTask(task)" class="icon-btn tiny-btn" @click="assignmentForm.taskId = task._id; showAssignModal = true" title="Assign task">
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
                    <h2>Task Management</h2>
                    <span class="count-pill">{{ visibleTasks.length }}</span>
                  </div>
                  <p>Comprehensive tracker for all tasks across your teams.</p>
                </div>

                <!-- Filters -->
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                  <button
                    class="secondary-btn tiny-btn"
                    style="width: auto; padding: 6px 12px; font-size: 12px;"
                    :class="{ 'primary-btn': taskFilter === 'all' }"
                    @click="taskFilter = 'all'"
                  >All</button>
                  <button
                    class="secondary-btn tiny-btn"
                    style="width: auto; padding: 6px 12px; font-size: 12px;"
                    :class="{ 'primary-btn': taskFilter === 'inProgress' }"
                    @click="taskFilter = 'inProgress'"
                  >In progress</button>
                  <button
                    class="secondary-btn tiny-btn"
                    style="width: auto; padding: 6px 12px; font-size: 12px;"
                    :class="{ 'primary-btn': taskFilter === 'completed' }"
                    @click="taskFilter = 'completed'"
                  >Completed</button>
                  <button class="primary-btn" @click="showTaskModal = true">
                    <Plus :size="16" /> New Task
                  </button>
                </div>
              </div>

              <div class="task-table-wrap">
                <table class="task-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Team</th>
                      <th>Status</th>
                      <th>Start Date</th>
                      <th>Due Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="task in visibleTasks" :key="task._id">
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
                          <div>
                            <strong :class="{ strikethrough: taskStatus(task) === 'Completed' }">
                              {{ task.title }}
                            </strong>
                            <small>{{ task.description }}</small>
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
                          {{ taskStatus(task) }}
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
                          <button v-if="canManageTask(task)" class="icon-btn tiny-btn" @click="assignmentForm.taskId = task._id; showAssignModal = true" title="Assign task">
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
                        No tasks found in this view.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="panel-footer">
                <span>{{ visibleTasks.length }} tasks match current criteria</span>
                <button class="link-btn" @click="showTaskModal = true">
                  <Plus :size="14" /> Create task
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
                    <h2>Teams & Workgroups</h2>
                    <span class="count-pill">{{ teams.length }}</span>
                  </div>
                  <p>Organize members and permissions across project domains.</p>
                </div>
                <button v-if="isAdmin" class="primary-btn" @click="openCreateTeam">
                  <Plus :size="17" /> Create Team
                </button>
              </div>

              <div class="cards-grid">
                <article v-for="team in teams" :key="team._id" class="entity-card glass glass-interactive">
                  <div class="entity-card-head">
                    <div class="entity-icon"><Users :size="20" /></div>
                    <button class="icon-btn tiny-btn" @click="teamEdit = { teamId: team._id, name: team.name }; showTeamModal = true" title="Rename team">
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

                  <!-- Team Member management -->
                  <div class="team-members-list" v-if="team.teamMembers?.length">
                    <div v-for="member in team.teamMembers" :key="getId(member)" class="team-member-row">
                      <span>{{ getMemberName(member) }}</span>
                      <select
                        :value="teamAdminIds(team).some(a => getId(a) === getId(member)) ? 'teamAdmin' : 'teamMember'"
                        @change="changeTeamRole(team, member, $event.target.value)"
                      >
                        <option value="teamMember">Member</option>
                        <option value="teamAdmin">Admin</option>
                      </select>
                      <button
                        class="icon-btn tiny-btn danger-btn"
                        v-if="getId(member) !== getId(team.addedBy)"
                        @click="removeTeamMember(team, member)"
                        title="Remove member"
                      >
                        <X :size="13" />
                      </button>
                    </div>
                  </div>

                  <div class="entity-actions">
                    <button class="secondary-btn" @click="openTeamMembers(team)">
                      <UserPlus :size="14" /> Add member
                    </button>
                    <button class="icon-btn danger-btn" @click="deleteTeam(team)" title="Delete team">
                      <Trash2 :size="15" />
                    </button>
                  </div>
                </article>

                <div v-if="!teams.length" class="empty-card">
                  <Users :size="32" />
                  <h3>No teams yet</h3>
                  <p>Create your first team to assign work and collaborate.</p>
                  <button v-if="isAdmin" class="primary-btn" @click="openCreateTeam">
                    <Plus :size="16" /> Create Team
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
                    <h2>Directory of Members</h2>
                    <span class="count-pill">{{ members.length }}</span>
                  </div>
                  <p>User accounts invited and managed by your organization.</p>
                </div>
                <button v-if="isAdmin" class="primary-btn" @click="showMemberModal = true">
                  <Plus :size="17" /> Invite Member
                </button>
              </div>

              <div class="member-list">
                <div v-for="member in members" :key="member._id" class="member-list-row">
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
                    <h2>Assigned to Me</h2>
                    <span class="count-pill">{{ myAssignments.length }}</span>
                  </div>
                  <p>Keep track of your direct commitments and update statuses in real time.</p>
                </div>
              </div>

              <div class="assignment-grid">
                <article v-for="assignment in myAssignments" :key="assignment._id" class="assignment-card glass glass-interactive">
                  <div class="assignment-top">
                    <span class="status-dot" :class="taskStatus({ myAssignment: assignment }).toLowerCase().replaceAll(' ', '-')"></span>
                    <span class="status-pill" :class="taskStatus({ myAssignment: assignment }).toLowerCase().replaceAll(' ', '-')">
                      {{ taskStatus({ myAssignment: assignment }) }}
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
                      @click="toggleTaskStatus({ _id: assignment.task?._id, myAssignment: assignment })"
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
                  <span>Status</span>
                  <strong>{{ currentUser?.confirmed ? 'Active & Confirmed' : 'Pending verification' }}</strong>
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
      <div v-if="showTaskModal" class="modal-backdrop" @click.self="showTaskModal = false">
        <section class="create-modal glass-panel">
          <div class="modal-heading">
            <div>
              <div class="eyebrow">NEW TASK</div>
              <h2>Create Task</h2>
              <p>Specify the work details and assign it to a team.</p>
            </div>
            <button class="icon-btn tiny-btn" @click="showTaskModal = false"><X :size="18" /></button>
          </div>

          <form @submit.prevent="createTask" class="form-stack">
            <label>
              Task Title
              <input v-model="taskForm.title" required minlength="3" maxlength="150" placeholder="e.g., Implement Glassmorphic Navbar" />
            </label>
            <label>
              Description
              <textarea v-model="taskForm.description" required minlength="3" rows="3" placeholder="Provide context and deliverables…"></textarea>
            </label>
            <label>
              Target Team
              <select v-model="taskForm.teamId" required>
                <option value="" disabled>Select a team</option>
                <option v-for="team in teams" :key="team._id" :value="team._id">{{ team.name }}</option>
              </select>
            </label>
            <div class="two-fields">
              <label>Start Date<input v-model="taskForm.startDate" type="date" required /></label>
              <label>Due Date<input v-model="taskForm.endDate" type="date" :min="taskForm.startDate" required /></label>
            </div>

            <div class="modal-actions">
              <button type="button" class="secondary-btn" @click="showTaskModal = false">Cancel</button>
              <button class="primary-btn" :disabled="busy">
                <Plus :size="16" /> Create Task
              </button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <!-- CREATE / RENAME TEAM MODAL -->
    <Transition name="modal">
      <div v-if="showTeamModal" class="modal-backdrop" @click.self="showTeamModal = false">
        <section class="create-modal glass-panel">
          <div class="modal-heading">
            <div>
              <div class="eyebrow">TEAMS</div>
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
              <button type="button" class="secondary-btn" @click="showTeamModal = false">Cancel</button>
              <button class="primary-btn">
                <Plus :size="16" /> {{ teamEdit.teamId ? 'Save Changes' : 'Create Team' }}
              </button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <!-- ADD MEMBER TO TEAM MODAL -->
    <Transition name="modal">
      <div v-if="showTeamMemberModal" class="modal-backdrop" @click.self="showTeamMemberModal = false">
        <section class="create-modal glass-panel">
          <div class="modal-heading">
            <div>
              <div class="eyebrow">COLLABORATION</div>
              <h2>Add Team Member</h2>
              <p>Add an existing user account to this team.</p>
            </div>
            <button class="icon-btn tiny-btn" @click="showTeamMemberModal = false"><X :size="18" /></button>
          </div>

          <form @submit.prevent="addMemberToTeam" class="form-stack">
            <label>
              Select Member
              <select v-model="addTeamMemberForm.memberId" required>
                <option value="" disabled>Choose member</option>
                <option v-for="member in members" :key="member._id" :value="member._id">
                  {{ getMemberName(member) }} ({{ member.email }})
                </option>
              </select>
            </label>
            <label>
              Role in Team
              <select v-model="addTeamMemberForm.role">
                <option value="teamMember">Member</option>
                <option value="teamAdmin">Team Admin</option>
              </select>
            </label>
            <div class="modal-actions">
              <button type="button" class="secondary-btn" @click="showTeamMemberModal = false">Cancel</button>
              <button class="primary-btn"><UserPlus :size="16" /> Add Member</button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <!-- CREATE MEMBER MODAL -->
    <Transition name="modal">
      <div v-if="showMemberModal" class="modal-backdrop" @click.self="showMemberModal = false">
        <section class="create-modal glass-panel">
          <div class="modal-heading">
            <div>
              <div class="eyebrow">DIRECTORY</div>
              <h2>Invite Member</h2>
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
              <button type="button" class="secondary-btn" @click="showMemberModal = false">Cancel</button>
              <button class="primary-btn"><UserPlus :size="16" /> Invite Member</button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <!-- ASSIGN TASK MODAL -->
    <Transition name="modal">
      <div v-if="showAssignModal" class="modal-backdrop" @click.self="showAssignModal = false">
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
              Task
              <select v-model="assignmentForm.taskId" required>
                <option value="" disabled>Select task</option>
                <option v-for="task in tasks" :key="task._id" :value="task._id">{{ task.title }}</option>
              </select>
            </label>
            <label>
              Member
              <select v-model="assignmentForm.memberId" required>
                <option value="" disabled>Select member</option>
                <option v-for="member in members" :key="member._id" :value="member._id">
                  {{ getMemberName(member) }} ({{ member.email }})
                </option>
              </select>
            </label>

            <div class="modal-actions">
              <button type="button" class="secondary-btn" @click="showAssignModal = false">Cancel</button>
              <button class="primary-btn"><UserPlus :size="16" /> Assign</button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <!-- CHANGE PASSWORD MODAL -->
    <Transition name="modal">
      <div v-if="showPasswordModal" class="modal-backdrop" @click.self="showPasswordModal = false">
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
              <button type="button" class="secondary-btn" @click="showPasswordModal = false">Cancel</button>
              <button class="primary-btn"><KeyRound :size="16" /> Update Password</button>
            </div>
          </form>
        </section>
      </div>
    </Transition>

    <!-- TOAST NOTIFICATION -->
    <AppToast :message="toast" :is-error="Boolean(error)" @dismiss="toast = ''; error = ''" />
  </div>
</template>
