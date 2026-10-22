const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

if (import.meta.env.PROD && !API_BASE_URL) {
  console.warn('VITE_API_BASE_URL is not set. The frontend will call its own domain for the API, which only works if the backend is proxied there.')
}

export { setSession, clearSession } from '../stores/session.js'
import { setSession, clearSession } from '../stores/session.js'

const NO_AUTH_PATHS = ['/auth/signIn', '/auth/signUp', '/auth/confirmSignUp', '/auth/resendOtp', '/auth/forgotPassword', '/auth/resetPassword', '/auth/sign&signin/gmail', '/auth/refreshToken']

let refreshing = null

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
    throw new Error('Cannot reach the server. Check your connection and try again.')
  }
  const data = await response.json().catch(() => ({}))
  return { response, data }
}

// Turns the backend's error shapes ({message} or Joi {message:'Validation Error', errors:[...]}) into one readable string.
function errorMessage(response, data) {
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors.map(e => e.message).join(' · ')
  }
  if (response.status === 429) return data.message || 'Too many requests. Please wait a moment.'
  return data.message || `Request failed (${response.status})`
}

export async function apiRequest(path, options = {}) {
  const demo = localStorage.getItem('taskverse-demo') === 'true'
  let token = localStorage.getItem('taskverse-token')
  let { response, data } = await rawRequest(path, options, token)

  if (response.status === 401 && !demo && !NO_AUTH_PATHS.some(p => path.startsWith(p)) && localStorage.getItem('taskverse-refresh-token')) {
    try {
      token = await refreshAccessToken()
      ;({ response, data } = await rawRequest(path, options, token))
    } catch {
      sessionExpired()
      throw new Error('Your session expired. Please sign in again.')
    }
  }
  if (response.status === 401 && !NO_AUTH_PATHS.some(p => path.startsWith(p)) && !demo) {
    sessionExpired()
  }
  if (!response.ok) throw new Error(errorMessage(response, data))
  return data
}
export const api = {
  signIn: async body => apiRequest('/auth/signIn', { method: 'POST', body: JSON.stringify(body) }),
  signUp: async body => apiRequest('/auth/signUp', { method: 'POST', body: JSON.stringify(body) }),
  confirmSignUp: async body => apiRequest('/auth/confirmSignUp', { method: 'POST', body: JSON.stringify(body) }),
  resendOtp: async body => apiRequest('/auth/resendOtp', { method: 'POST', body: JSON.stringify(body) }),
  googleSignIn: async body => apiRequest('/auth/sign&signin/gmail', { method: 'POST', body: JSON.stringify(body) }),
  logout: async flag => apiRequest(`/auth/logout${flag ? `?flag=${encodeURIComponent(flag)}` : ''}`, { method: 'POST' }),
  getProfile: async () => apiRequest('/auth/profile', { method: 'POST' }),
  refreshToken: async () => ({ data: { accessToken: await refreshAccessToken() } }),
  forgotPassword: async body => apiRequest('/auth/forgotPassword', { method: 'POST', body: JSON.stringify(body) }),
  resetPassword: async body => apiRequest('/auth/resetPassword', { method: 'POST', body: JSON.stringify(body) }),
  changePassword: async body => apiRequest('/auth/changePassword', { method: 'POST', body: JSON.stringify(body) }),
  members: async () => apiRequest('/member/'),
  memberProfile: async () => apiRequest('/member/profile'),
  createMember: async body => apiRequest('/member/createMember', { method: 'POST', body: JSON.stringify(body) }),
  teams: async () => apiRequest('/team/'),
  createTeam: async body => apiRequest('/team/createTeam', { method: 'POST', body: JSON.stringify(body) }),
  addMemberToTeam: async body => apiRequest('/team/addMemberToTeam', { method: 'POST', body: JSON.stringify(body) }),
  removeMemberFromTeam: async body => apiRequest('/team/removeMemberFromTeam', { method: 'POST', body: JSON.stringify(body) }),
  updateMemberRoleInTeam: async body => apiRequest('/team/updateMemberRoleInTeam', { method: 'POST', body: JSON.stringify(body) }),
  updateTeamName: async body => apiRequest('/team/updateTeamName', { method: 'POST', body: JSON.stringify(body) }),
  deleteTeam: async body => apiRequest('/team/deleteTeam', { method: 'POST', body: JSON.stringify(body) }),
  tasks: async () => apiRequest('/task/'),
  createTask: async body => apiRequest('/task/createTask', { method: 'POST', body: JSON.stringify(body) }),
  deleteTask: async taskId => apiRequest(`/task/${encodeURIComponent(taskId)}`, { method: 'DELETE' }),
  assignments: async () => apiRequest('/taskAssignment/'),
  addMemberToTask: async body => apiRequest('/taskAssignment/addMemberToTask', { method: 'POST', body: JSON.stringify(body) }),
  updateTaskStatus: async body => apiRequest('/taskAssignment/taskStatusByMember', { method: 'PATCH', body: JSON.stringify(body) }),
}
