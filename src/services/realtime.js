import { ref } from 'vue'

// Live updates. Preferred transport: Server-Sent Events at GET {API}/events (see BACKEND_API_SPEC.md).
// EventSource cannot send an Authorization header, so the stream is read with fetch().
// If the endpoint does not exist yet (or drops), the client falls back to polling so the UI still refreshes.
export const rtStatus = ref('off') // 'off' | 'live' | 'polling'

// One cheap /changes call per poll (reloads happen only when something changed); the backend allows ~600 req / 15 min per user.
const POLL_MS = 25_000
let ctrl = null
let pollTimer = null
let retryTimer = null
let retry = 0
let opts = null

const clearTimers = () => { clearInterval(pollTimer); clearTimeout(retryTimer); pollTimer = retryTimer = null }

function startPolling() {
  if (pollTimer || !opts) return
  rtStatus.value = 'polling'
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') opts?.onPoll?.() }, POLL_MS)
}

function scheduleRetry() {
  if (!opts) return
  startPolling()
  const delay = Math.min(60_000, 2_000 * 2 ** retry++)
  retryTimer = setTimeout(connect, delay)
}

async function connect() {
  if (!opts) return
  ctrl = new AbortController()
  try {
    const res = await fetch(`${opts.baseUrl}/events`, {
      headers: { Authorization: `Bearer ${opts.getToken()}`, Accept: 'text/event-stream' },
      signal: ctrl.signal
    })
    if (!res.ok || !res.body) throw new Error(String(res.status))
    clearInterval(pollTimer); pollTimer = null
    retry = 0
    rtStatus.value = 'live'
    opts.onPoll?.() // catch up on anything missed while disconnected

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n')
        if (!data) continue // comment / heartbeat
        try { opts.onEvent(JSON.parse(data)) } catch { /* ignore malformed events */ }
      }
    }
    throw new Error('closed')
  } catch (e) {
    if (e.name === 'AbortError') return
    scheduleRetry()
  }
}

export function startRealtime(options) {
  stopRealtime()
  opts = options
  connect()
  startPolling() // until the stream proves itself, keep data fresh
}

export function stopRealtime() {
  opts = null
  ctrl?.abort()
  ctrl = null
  clearTimers()
  retry = 0
  rtStatus.value = 'off'
}
