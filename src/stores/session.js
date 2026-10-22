const TOKEN_KEY = 'taskverse-token'
const REFRESH_TOKEN_KEY = 'taskverse-refresh-token'
const USER_KEY = 'taskverse-user'

export function setSession({ accessToken, refreshToken, user } = {}) {
  if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
