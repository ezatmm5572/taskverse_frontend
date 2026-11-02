const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

if (import.meta.env.PROD && !API_BASE_URL) {
  console.warn('VITE_API_BASE_URL is not set. The frontend will call its own domain for the API, which only works if the backend is proxied there.')
}

export { setSession, clearSession } from '../stores/session.js'
export { API_BASE_URL }
import { setSession, clearSession } from '../stores/session.js'

const NO_AUTH_PATHS = ['/auth/signIn', '/auth/signUp', '/auth/confirmSignUp', '/auth/resendOtp', '/auth/forgotPassword', '/auth/resetPassword', '/auth/sign&signin/gmail', '/auth/refreshToken', '/public/', '/push/key']
// A 401 with one of these codes is a wrong credential, not an expired session: never refresh/sign out for it.
const NON_SESSION_401 = new Set(['INVALID_PASSWORD', 'INVALID_OLD_PASSWORD', 'OTP_INVALID', 'OTP_EXPIRED'])

// Friendly English text per backend `code` (the UI is translated by text, never by raw server message).
export const ERROR_TEXT = {
  VIEWER_READ_ONLY: 'You have read-only (Viewer) access in this team.',
  EMAIL_NOT_CONFIRMED: 'Please confirm your email first. We can send you a new code.',
  ACCOUNT_DEACTIVATED: 'This account has been deactivated. Contact your administrator.',
  INVALID_PASSWORD: 'Incorrect password.',
  USER_NOT_FOUND: 'No account found for this email.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  MEMBER_EXISTS: 'A member with this email already exists.',
  ALREADY_EXISTS: 'This item already exists.',
  ALREADY_ASSIGNED: 'This member is already assigned.',
  TASK_NOT_FOUND: 'This task no longer exists.',
  NOT_FOUND: 'Not found.',
  FORBIDDEN: 'You do not have permission to do that.',
  CONFLICT: 'Someone else changed this item. Refresh and try again.',
  INVALID_TOKEN: 'Your session expired. Please sign in again.'
}

let refreshing = null
let lastServerDate = ''
export const serverNow = () => lastServerDate

// The backend's /auth/refreshToken reads the REFRESH token from the Authorization header.
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('taskverse-refresh-token')
  if (!refreshToken) throw new Error('No refresh token')
  if (!refreshing) {
    refreshing = fetch(`${API_BASE_URL}/auth/refreshToken`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${refreshToken}` },
    })
      .then(async res => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok || !body?.data?.accessToken) throw new Error(body.message || 'Refresh failed')
        setSession(body.data)
        return body.data.accessToken
      })
      .finally(() => { refreshing = null })
  }
  return refreshing
}

function sessionExpired() {
  clearSession()
  window.dispatchEvent(new CustomEvent('taskverse:session-expired'))
}

async function rawRequest(path, options, token) {
  const isForm = options.body instanceof FormData
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(isForm || options.body == null ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    })
  } catch {
    throw Object.assign(new Error('Cannot reach the server. Check your connection and try again.'), { code: 'NETWORK', status: 0 })
  }
  const d = response.headers.get('date')
  if (d) lastServerDate = new Date(d).toISOString()
  const type = response.headers.get('content-type') || ''
  const data = options.blob && response.ok ? await response.blob()
    : type.includes('json') || !response.ok ? await response.json().catch(() => ({})) : {}
  return { response, data }
}

// Turns the backend's error shapes ({message, code} or Joi {errors:[...]}) into one readable string.
function errorMessage(response, data) {
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors.map(e => e.message).join(' · ')
  }
  if (data?.code && ERROR_TEXT[data.code]) return ERROR_TEXT[data.code]
  if (response.status === 429) return data.message || ERROR_TEXT.RATE_LIMITED
  return data.message || `Request failed (${response.status})`
}

export async function apiRequest(path, options = {}) {
  const demo = localStorage.getItem('taskverse-demo') === 'true'
  const guest = NO_AUTH_PATHS.some(p => path.startsWith(p))
  let token = localStorage.getItem('taskverse-token')
  let { response, data } = await rawRequest(path, options, token)
  const sessionProblem = () => response.status === 401 && !NON_SESSION_401.has(data?.code)

  if (sessionProblem() && !demo && !guest && localStorage.getItem('taskverse-refresh-token')) {
    try {
      token = await refreshAccessToken()
      ;({ response, data } = await rawRequest(path, options, token))
    } catch {
      sessionExpired()
      throw Object.assign(new Error('Your session expired. Please sign in again.'), { code: 'INVALID_TOKEN', status: 401 })
    }
  }
  if (sessionProblem() && !guest && !demo) sessionExpired()
  if (!response.ok) {
    throw Object.assign(new Error(errorMessage(response, data)), { code: data?.code || '', status: response.status, details: data?.errors })
  }
  return data
}

const json = (method, body) => ({ method, body: JSON.stringify(body ?? {}) })
const enc = encodeURIComponent
const qs = params => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') q.set(k, v)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const api = {
  // --- auth ---
  signIn: body => apiRequest('/auth/signIn', json('POST', body)),
  signUp: body => apiRequest('/auth/signUp', json('POST', body)),
  confirmSignUp: body => apiRequest('/auth/confirmSignUp', json('POST', body)),
  resendOtp: body => apiRequest('/auth/resendOtp', json('POST', body)),
  googleSignIn: body => apiRequest('/auth/sign&signin/gmail', json('POST', body)),
  logout: flag => apiRequest(`/auth/logout${flag ? `?flag=${enc(flag)}` : ''}`, { method: 'POST' }),
  getProfile: () => apiRequest('/member/profile'),
  refreshToken: async () => ({ data: { accessToken: await refreshAccessToken() } }),
  forgotPassword: body => apiRequest('/auth/forgotPassword', json('POST', body)),
  resetPassword: body => apiRequest('/auth/resetPassword', json('POST', body)),
  changePassword: body => apiRequest('/auth/changePassword', json('POST', body)),
  sessions: () => apiRequest('/auth/sessions'),
  revokeSession: id => apiRequest(`/auth/sessions/${enc(id)}`, { method: 'DELETE' }),
  changeEmail: body => apiRequest('/auth/changeEmail', json('PATCH', body)),
  confirmChangeEmail: body => apiRequest('/auth/confirmChangeEmail', json('POST', body)),
  deleteAccount: body => apiRequest('/auth/account', json('DELETE', body)),

  // --- members ---
  members: () => apiRequest('/member'),
  memberProfile: () => apiRequest('/member/profile'),
  createMember: body => apiRequest('/member/createMember', json('POST', body)),
  updateMember: (id, body) => apiRequest(`/member/${enc(id)}`, body instanceof FormData ? { method: 'PATCH', body } : json('PATCH', body)),
  deleteMember: id => apiRequest(`/member/${enc(id)}`, { method: 'DELETE' }),
  resetMemberPassword: id => apiRequest(`/member/${enc(id)}/resetPassword`, { method: 'POST' }),
  setMemberActive: (id, active) => apiRequest(`/member/${enc(id)}/active`, json('PATCH', { active })),
  preferences: () => apiRequest('/member/preferences'),
  updatePreferences: body => apiRequest('/member/preferences', json('PATCH', body)),

  // --- teams ---
  teams: () => apiRequest('/team'),
  team: id => apiRequest(`/team/${enc(id)}`),
  createTeam: body => apiRequest('/team/createTeam', json('POST', body)),
  addMemberToTeam: body => apiRequest('/team/addMemberToTeam', json('POST', body)),
  removeMemberFromTeam: body => apiRequest('/team/removeMemberFromTeam', json('POST', body)),
  updateMemberRoleInTeam: body => apiRequest('/team/updateMemberRoleInTeam', json('POST', body)),
  updateTeamName: body => apiRequest('/team/updateTeamName', json('POST', body)),
  deleteTeam: body => apiRequest('/team/deleteTeam', json('POST', body)),
  restoreTeam: body => apiRequest('/team/restore', json('POST', body)),

  // --- tasks ---
  tasks: params => apiRequest(`/task${qs(params)}`),
  task: id => apiRequest(`/task/${enc(id)}`),
  createTask: body => apiRequest('/task/createTask', json('POST', body)),
  updateTask: (id, body) => apiRequest(`/task/${enc(id)}`, json('PATCH', body)),
  deleteTask: id => apiRequest(`/task/${enc(id)}`, { method: 'DELETE' }),
  restoreTask: id => apiRequest(`/task/${enc(id)}/restore`, { method: 'POST' }),
  bulkDeleteTasks: ids => apiRequest('/task/bulkDelete', json('POST', { ids })),
  bulkRestoreTasks: ids => apiRequest('/task/bulkRestore', json('POST', { ids })),
  shareTask: id => apiRequest(`/task/${enc(id)}/share`, { method: 'POST' }),
  unshareTask: id => apiRequest(`/task/${enc(id)}/share`, { method: 'DELETE' }),
  completeAndSpawn: id => apiRequest(`/task/${enc(id)}/complete-and-spawn`, { method: 'POST' }),

  // --- assignments ---
  assignments: () => apiRequest('/taskAssignment'),
  myAssignments: () => apiRequest('/taskAssignment/mine'),
  addMemberToTask: body => apiRequest('/taskAssignment/addMemberToTask', json('POST', body)),
  removeMemberFromTask: body => apiRequest('/taskAssignment/removeMemberFromTask', json('POST', body)),
  updateTaskStatus: body => apiRequest('/taskAssignment/taskStatusByMember', json('PATCH', body)),
  bulkStatus: body => apiRequest('/taskAssignment/bulkStatus', json('POST', body)),

  // --- subtasks / comments / attachments / time ---
  addSubtask: (taskId, text) => apiRequest(`/task/${enc(taskId)}/subtasks`, json('POST', { text })),
  updateSubtask: (taskId, subId, body) => apiRequest(`/task/${enc(taskId)}/subtasks/${enc(subId)}`, json('PATCH', body)),
  removeSubtask: (taskId, subId) => apiRequest(`/task/${enc(taskId)}/subtasks/${enc(subId)}`, { method: 'DELETE' }),
  comments: taskId => apiRequest(`/task/${enc(taskId)}/comments`),
  addComment: (taskId, text) => apiRequest(`/task/${enc(taskId)}/comments`, json('POST', { text })),
  removeComment: (taskId, id) => apiRequest(`/task/${enc(taskId)}/comments/${enc(id)}`, { method: 'DELETE' }),
  attachments: taskId => apiRequest(`/task/${enc(taskId)}/attachments`),
  addAttachment: (taskId, file) => { const f = new FormData(); f.append('file', file); return apiRequest(`/task/${enc(taskId)}/attachments`, { method: 'POST', body: f }) },
  removeAttachment: (taskId, id) => apiRequest(`/task/${enc(taskId)}/attachments/${enc(id)}`, { method: 'DELETE' }),
  timeEntries: taskId => apiRequest(`/task/${enc(taskId)}/time`),
  addTime: (taskId, body) => apiRequest(`/task/${enc(taskId)}/time`, json('POST', body)),
  removeTime: (taskId, id) => apiRequest(`/task/${enc(taskId)}/time/${enc(id)}`, { method: 'DELETE' }),

  // --- templates / notifications / push ---
  templates: () => apiRequest('/templates'),
  createTemplate: body => apiRequest('/templates', json('POST', body)),
  deleteTemplate: id => apiRequest(`/templates/${enc(id)}`, { method: 'DELETE' }),
  notifications: params => apiRequest(`/notifications${qs(params)}`),
  markNotificationsRead: body => apiRequest('/notifications/read', json('POST', body)),
  deleteNotification: id => apiRequest(`/notifications/${enc(id)}`, { method: 'DELETE' }),
  pushKey: () => apiRequest('/push/key'),
  pushSubscribe: body => apiRequest('/push/subscribe', json('POST', body)),
  pushUnsubscribe: body => apiRequest('/push/subscribe', json('DELETE', body)),

  // --- sync / reports ---
  changes: since => apiRequest(`/changes${qs({ since })}`),
  dashboard: team => apiRequest(`/dashboard${qs({ team })}`),
  search: (q, types = 'task,team,member') => apiRequest(`/search${qs({ q, types, limit: 20 })}`),
  exportTasksCsv: params => apiRequest(`/export/tasks.csv${qs(params)}`, { blob: true }),
  exportReportPdf: team => apiRequest(`/export/report.pdf${qs({ team })}`, { blob: true }),
}

// Unwraps `{ data: [...] }` or `{ data: { items: [...] }, meta }` into an array.
export const asList = res => Array.isArray(res?.data) ? res.data : Array.isArray(res?.data?.items) ? res.data.items : []
