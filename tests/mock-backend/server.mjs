// In-memory stand-in for the TaskVerse backend, implemented from TaskVerse_API_Documentation.md.
// Only what the frontend uses; the real server is authoritative. Run: node tests/mock-backend/server.mjs [port]
// Test-only helpers: GET /__log (request log), GET /__otp?email=, POST /__reset.
import http from 'node:http'

const PORT = Number(process.argv[2] || process.env.PORT || 3911)
const PW_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
let n = 1
const id = () => (n++).toString(16).padStart(24, '0')
const now = () => new Date().toISOString()

let db
const fresh = () => ({ members: [], teams: [], tasks: [], assignments: [], comments: [], attachments: [], times: [], notifs: [], templates: [], otps: {}, tokens: new Map(), sessions: [], changes: [] })
db = fresh()
const log = []

const pub = m => { const { password, ...rest } = m; return { ...rest, teams: db.teams.filter(t => !t.deletedAt && t.members[m._id]).map(t => ({ teamId: t._id, name: t.name, role: t.members[m._id] })) } }
const addMember = o => { const m = { _id: id(), role: 'member', provider: 'system', confirmed: true, active: true, addedBy: null, createdAt: now(), updatedAt: now(), ...o }; db.members.push(m); return m }
const touch = (kind, ref) => { db.changes.push({ at: Date.now(), kind, id: ref }) }

const send = (res, status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', ...headers }); res.end(JSON.stringify(body)) }
const ok = (res, message, data, status = 200, extra = {}) => send(res, status, data === undefined ? { message, ...extra } : { message, data, ...extra })
const err = (res, status, code, message, extra) => send(res, status, { message, code, ...extra })

function issue(m, ua = '') {
  const sess = { _id: id(), member: m._id, userAgent: ua, createdAt: now() }
  db.sessions.push(sess)
  const mk = kind => { const t = `${kind}.${m._id}.${id()}`; db.tokens.set(t, { memberId: m._id, kind, session: sess._id }); return t }
  return { accessToken: mk('access'), refreshToken: mk('refresh') }
}
const whoAmI = (req, kind = 'access') => { const t = (req.headers.authorization || '').replace('Bearer ', ''); const r = db.tokens.get(t); return r && r.kind === kind ? { m: db.members.find(x => x._id === r.memberId), token: t, rec: r } : null }

// ---- permissions (section 13 of the doc) ----
const roleOf = (m, team) => (team && team.members[m._id]) || null
const isSA = m => m.role === 'admin'
const canManageTeam = (m, t) => isSA(m) || t.addedBy === m._id || roleOf(m, t) === 'admin'
const canManageTask = (m, task) => { if (isSA(m) || task.createdBy === m._id) return true; const t = db.teams.find(x => x._id === task.team); return !!t && canManageTeam(m, t) }
const isAssignee = (m, task) => db.assignments.some(a => a.task === task._id && a.member === m._id)
const canRead = (m, task) => { if (isSA(m) || task.createdBy === m._id || isAssignee(m, task)) return true; const t = db.teams.find(x => x._id === task.team); return !!t && !!roleOf(m, t) }
const isViewerFor = (m, task) => { if (isSA(m)) return false; const t = db.teams.find(x => x._id === task.team); return !!t && roleOf(m, t) === 'viewer' && !canManageTask(m, task) }
const viewerBlock = (res, m, task) => { if (isViewerFor(m, task)) { err(res, 403, 'VIEWER_READ_ONLY', 'Viewers have read-only access'); return true } return false }

const normStatus = s => ({ complete: 'completed', fail: 'failed' }[s] || s)
const derived = task => { const a = db.assignments.filter(x => x.task === task._id); if (!a.length) return 'toDo'; if (a.every(x => x.status === 'completed')) return 'completed'; if (a.some(x => x.status === 'failed')) return 'failed'; if (a.some(x => x.status === 'inProgress')) return 'inProgress'; return 'toDo' }
const shortMember = m => m && ({ _id: m._id, fname: m.fname, lname: m.lname, email: m.email })
const taskOut = (task, full = false) => {
  const team = db.teams.find(x => x._id === task.team)
  const assigns = db.assignments.filter(a => a.task === task._id)
  const out = {
    ...task,
    team: team ? { _id: team._id, name: team.name } : null,
    createdBy: shortMember(db.members.find(m => m._id === task.createdBy)),
    assignees: assigns.map(a => ({ ...shortMember(db.members.find(m => m._id === a.member)), status: a.status })),
    status: derived(task),
    subtaskCount: task.subtasks.length, subtaskDone: task.subtasks.filter(s => s.done).length,
    commentCount: db.comments.filter(c => c.task === task._id).length,
    loggedMin: db.times.filter(t => t.task === task._id).reduce((s, t) => s + t.minutes, 0)
  }
  if (full) {
    out.comments = db.comments.filter(c => c.task === task._id).map(c => ({ ...c, author: shortMember(db.members.find(m => m._id === c.author)) }))
    out.attachments = db.attachments.filter(a => a.task === task._id)
    out.timeEntries = db.times.filter(t => t.task === task._id).map(t => ({ ...t, author: shortMember(db.members.find(m => m._id === t.author)) }))
  }
  return out
}
const asgOut = a => ({ ...a, task: taskOut(db.tasks.find(t => t._id === a.task)), member: shortMember(db.members.find(m => m._id === a.member)) })
const teamOut = t => ({ _id: t._id, name: t.name, addedBy: shortMember(db.members.find(m => m._id === t.addedBy)), teamAdims: Object.keys(t.members).filter(k => t.members[k] === 'admin'), teamAdmins: Object.keys(t.members).filter(k => t.members[k] === 'admin'), teamMembers: Object.keys(t.members).map(k => shortMember(db.members.find(m => m._id === k))), createdAt: t.createdAt, updatedAt: t.updatedAt })
const notify = (user, type, text, task) => { db.notifs.push({ _id: id(), user, type, text, task: task ? { _id: task._id, title: task.title } : null, readAt: null, createdAt: now() }) }

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}
const parseJson = buf => { try { return JSON.parse(buf.toString() || '{}') } catch { return {} } }
function validate(res, errors) { if (!errors.length) return true; err(res, 422, 'VALIDATION_ERROR', 'Validation Error', { errors: errors.map(([path, message]) => ({ key: 'body', path, message })) }); return false }
const roleNorm = r => (/admin/i.test(r || '') ? 'admin' : /viewer/i.test(r || '') ? 'viewer' : 'editor')

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  const url = new URL(req.url, 'http://x')
  const path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/'
  const raw = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : Buffer.alloc(0)
  const isMultipart = (req.headers['content-type'] || '').startsWith('multipart/')
  const b = isMultipart ? {} : parseJson(raw)
  log.push(`${req.method} ${path}`)
  const key = `${req.method} ${path}`

  if (path === '/__log') return send(res, 200, log)
  if (path === '/__otp') return send(res, 200, { otp: db.otps[url.searchParams.get('email')] })
  if (path === '/__reset') { db = fresh(); log.length = 0; return send(res, 200, { ok: true }) }
  if (path === '/') return ok(res, 'TaskVerse API is running', undefined)

  // ---- public auth ----
  if (key === 'POST /auth/signUp') {
    const e = []
    if (!b.fname || b.fname.length < 2) e.push(['fname', '"fname" length must be at least 2 characters long'])
    if (!/^\S+@\S+\.\S+$/.test(b.email || '')) e.push(['email', '"email" must be a valid email'])
    if (!PW_RE.test(b.password || '')) e.push(['password', 'password does not match the rules'])
    if (b.password !== b.confirmPassword) e.push(['confirmPassword', '"confirmPassword" must be [ref:password]'])
    if (!b.gender) e.push(['gender', '"gender" is required'])
    if (!validate(res, e)) return
    const email = b.email.toLowerCase()
    if (db.members.some(m => m.email === email)) return err(res, 409, 'MEMBER_EXISTS', 'User already exists')
    addMember({ fname: b.fname, lname: b.lname, email, password: b.password, gender: b.gender, role: 'admin', confirmed: false })
    db.otps[email] = '123456'
    return ok(res, 'Admin user created successfully', { email }, 201)
  }
  if (key === 'POST /auth/confirmSignUp') {
    const m = db.members.find(x => x.email === b.email)
    if (!m) return err(res, 404, 'USER_NOT_FOUND', 'User not found')
    if (!db.otps[b.email]) return err(res, 400, 'OTP_NOT_FOUND', 'Otp not found')
    if (db.otps[b.email] !== b.otp) return err(res, 400, 'OTP_INVALID', 'Invalid Otp')
    m.confirmed = true; delete db.otps[b.email]
    return ok(res, 'Email confirmed successfully')
  }
  if (key === 'POST /auth/resendOtp') { db.otps[b.email] = '123456'; return ok(res, 'Otp sent successfully') }
  if (key === 'POST /auth/signIn') {
    const m = db.members.find(x => x.email === (b.email || '').toLowerCase())
    if (!m) return err(res, 404, 'USER_NOT_FOUND', 'User not found')
    if (!m.confirmed) return err(res, 403, 'EMAIL_NOT_CONFIRMED', 'Email not confirmed')
    if (!m.active) return err(res, 403, 'ACCOUNT_DEACTIVATED', 'Account deactivated')
    if (m.password !== b.password) return err(res, 401, 'INVALID_PASSWORD', 'Invalid password')
    return ok(res, 'login successfully', issue(m, req.headers['user-agent']))
  }
  if (key === 'POST /auth/refreshToken') {
    const r = whoAmI(req, 'refresh')
    if (!r) return err(res, 401, 'INVALID_TOKEN', 'Invalid or expired token')
    db.tokens.delete(r.token)
    return ok(res, 'Tokens refreshed successfully', issue(r.m))
  }
  if (key === 'GET /public/task' || path.startsWith('/public/task/')) {
    const task = db.tasks.find(t => t.shareToken === path.split('/')[3] && !t.deletedAt)
    if (!task) return err(res, 404, 'NOT_FOUND', 'Not found')
    return ok(res, 'ok', { title: task.title, description: task.description, status: derived(task), startDate: task.startDate, endDate: task.endDate, priority: task.priority, subtasks: task.subtasks })
  }
  if (key === 'GET /push/key') return ok(res, 'ok', { publicKey: 'BMockKey' })

  // ---- everything below needs a valid access token ----
  const auth = whoAmI(req)
  if (!auth) return err(res, 401, 'INVALID_TOKEN', 'Missing, invalid, expired or revoked token')
  const me = auth.m

  if (key === 'GET /member/profile' || key === 'GET /auth/profile') return ok(res, 'ok', pub(me))
  if (key === 'POST /auth/logout') {
    if (url.searchParams.get('flag') === 'all') { for (const [t, v] of db.tokens) if (v.memberId === me._id) db.tokens.delete(t) } else db.tokens.delete(auth.token)
    return ok(res, 'Logout successfully')
  }
  if (key === 'POST /auth/changePassword') {
    if (b.oldPassword !== me.password) return err(res, 401, 'INVALID_PASSWORD', 'Invalid old password')
    if (!PW_RE.test(b.newPassword || '') || b.newPassword !== b.confirmPassword) return err(res, 422, 'VALIDATION_ERROR', 'Validation Error', { errors: [{ key: 'body', path: 'newPassword', message: 'invalid new password' }] })
    me.password = b.newPassword
    return ok(res, 'Password changed successfully')
  }
  if (key === 'PATCH /auth/changeEmail') {
    if (b.password !== me.password) return err(res, 401, 'INVALID_PASSWORD', 'Invalid password')
    if (db.members.some(m => m.email === (b.newEmail || '').toLowerCase())) return err(res, 409, 'MEMBER_EXISTS', 'Email already in use')
    me.pendingEmail = b.newEmail.toLowerCase(); db.otps[me.pendingEmail] = '123456'
    return ok(res, 'Verification code sent')
  }
  if (key === 'POST /auth/confirmChangeEmail') {
    if (!me.pendingEmail || db.otps[me.pendingEmail] !== b.otp) return err(res, 400, 'OTP_INVALID', 'Invalid Otp')
    me.email = me.pendingEmail; me.pendingEmail = null
    return ok(res, 'Email updated')
  }
  if (key === 'DELETE /auth/account') {
    if (b.password !== me.password) return err(res, 401, 'INVALID_PASSWORD', 'Invalid password')
    db.members = db.members.filter(m => m !== me); db.teams.forEach(t => delete t.members[me._id]); db.assignments = db.assignments.filter(a => a.member !== me._id)
    for (const [t, v] of db.tokens) if (v.memberId === me._id) db.tokens.delete(t)
    return ok(res, 'Account deleted')
  }
  if (path === '/push/subscribe') return ok(res, 'ok')
  if (key === 'GET /auth/sessions') return ok(res, 'ok', db.sessions.filter(s => s.member === me._id).map(s => ({ ...s, current: s._id === auth.rec.session })))
  if (req.method === 'DELETE' && path.startsWith('/auth/sessions/')) {
    const sid = path.split('/')[3]
    for (const [t, v] of db.tokens) if (v.session === sid && v.memberId === me._id) db.tokens.delete(t)
    db.sessions = db.sessions.filter(s => s._id !== sid)
    return ok(res, 'Session revoked')
  }

  // ---- members ----
  if (key === 'GET /member' || key === 'GET /member/all') return ok(res, 'ok', [...db.members].reverse().map(pub))
  if (key === 'POST /member/createMember') {
    if (!isSA(me)) return err(res, 403, 'FORBIDDEN', 'unauthorized')
    if (db.members.some(m => m.email === (b.email || '').toLowerCase())) return err(res, 409, 'MEMBER_EXISTS', 'Member already exists')
    if (b.password !== b.confirmPassword) return err(res, 400, 'BAD_REQUEST', 'Password and confirm password do not match')
    if (!validate(res, PW_RE.test(b.password || '') ? [] : [['password', 'password does not match the rules']])) return
    const m = addMember({ fname: b.fname, lname: b.lname, email: b.email.toLowerCase(), password: b.password, gender: b.gender, addedBy: me._id })
    touch('members', m._id)
    return ok(res, 'Member created successfully', pub(m), 201)
  }
  if (path.startsWith('/member/') && !['/member/profile', '/member/all', '/member/createMember', '/member/preferences'].includes(path)) {
    const [, , mid, sub] = path.split('/')
    const target = db.members.find(x => x._id === mid)
    if (!target) return err(res, 404, 'USER_NOT_FOUND', 'Member not found')
    if (req.method === 'PATCH' && !sub) { if (!isSA(me) && me._id !== mid) return err(res, 403, 'FORBIDDEN', 'Forbidden'); for (const k of ['fname', 'lname', 'gender']) if (b[k]) target[k] = b[k]; touch('members', mid); return ok(res, 'Member updated', pub(target)) }
    if (!isSA(me)) return err(res, 403, 'FORBIDDEN', 'Forbidden')
    if (req.method === 'DELETE' && !sub) { if (mid === me._id) return err(res, 400, 'BAD_REQUEST', 'Cannot delete yourself'); db.members = db.members.filter(x => x !== target); db.teams.forEach(t => delete t.members[mid]); db.assignments = db.assignments.filter(a => a.member !== mid); touch('members', mid); return ok(res, 'Member deleted') }
    if (req.method === 'POST' && sub === 'resetPassword') return ok(res, 'Password reset email sent')
    if (req.method === 'PATCH' && sub === 'active') { target.active = !!b.active; return ok(res, 'Member updated', pub(target)) }
  }
  if (path === '/member/preferences') return ok(res, 'ok', { emailAssigned: true, emailMention: true, emailDue: true, emailDigest: true })

  // ---- teams ----
  if (key === 'GET /team' || key === 'GET /team/all') {
    const list = db.teams.filter(t => !t.deletedAt && (isSA(me) || t.members[me._id] || t.addedBy === me._id))
    return ok(res, 'ok', list.map(teamOut))
  }
  if (key === 'POST /team/createTeam') {
    if (!isSA(me)) return err(res, 403, 'FORBIDDEN', 'You are not the team admin')
    if (!b.name || b.name.length < 2) return validate(res, [['name', '"name" length must be at least 2 characters long']])
    const t = { _id: id(), name: b.name, addedBy: me._id, members: { [me._id]: 'admin' }, createdAt: now(), updatedAt: now() }
    db.teams.push(t); touch('teams', t._id)
    return ok(res, 'Team created successfully', teamOut(t), 201)
  }
  if (path.startsWith('/team/') && req.method === 'POST') {
    const t = db.teams.find(x => x._id === b.teamId)
    if (!t) return err(res, 404, 'NOT_FOUND', 'Team not found')
    if (path !== '/team/restore' && t.deletedAt) return err(res, 404, 'NOT_FOUND', 'Team not found')
    if (!canManageTeam(me, t)) return err(res, 403, 'FORBIDDEN', 'You are not the team admin')
    if (path === '/team/addMemberToTeam') {
      const role = roleNorm(b.role)
      if (b.memberIds) {
        const added = []
        for (const mid of b.memberIds) { if (!db.members.some(m => m._id === mid) || t.members[mid]) continue; t.members[mid] = role; added.push(mid) }
        touch('teams', t._id)
        return ok(res, 'Members added successfully', { teamId: t._id, memberIds: added })
      }
      const m = db.members.find(x => x._id === b.memberId || x.email === b.member_email)
      if (!m) return err(res, 404, 'USER_NOT_FOUND', 'Member not found')
      if (t.members[m._id]) return err(res, 409, 'ALREADY_EXISTS', 'Member already in team')
      t.members[m._id] = role; touch('teams', t._id)
      return ok(res, 'Member added successfully', { teamId: t._id, memberId: m._id })
    }
    if (path === '/team/removeMemberFromTeam') {
      const ids = b.memberIds || [b.memberId]
      for (const mid of ids) if (!t.members[mid]) return err(res, 404, 'NOT_FOUND', 'Member not found in team')
      ids.forEach(i => delete t.members[i]); touch('teams', t._id)
      return ok(res, 'Member removed successfully', { teamId: t._id })
    }
    if (path === '/team/updateMemberRoleInTeam') {
      if (!t.members[b.memberId]) return err(res, 404, 'NOT_FOUND', 'Member not found in team')
      t.members[b.memberId] = roleNorm(b.role); touch('teams', t._id)
      return ok(res, 'Role updated successfully', { teamId: t._id, memberId: b.memberId, role: roleNorm(b.role) })
    }
    if (path === '/team/updateTeamName') { t.name = b.name; touch('teams', t._id); return ok(res, 'Team updated successfully', teamOut(t)) }
    if (path === '/team/deleteTeam') { t.deletedAt = now(); touch('teams', t._id); return ok(res, 'Team deleted successfully', { teamId: t._id }) }
    if (path === '/team/restore') { t.deletedAt = null; touch('teams', t._id); return ok(res, 'Team restored', teamOut(t)) }
  }

  // ---- tasks ----
  const visibleTasks = () => db.tasks.filter(t => !t.deletedAt && canRead(me, t))
  if (key === 'GET /task' || key === 'GET /task/all') {
    let list = visibleTasks().filter(t => url.searchParams.get('archived') === 'true' ? t.archived : !t.archived)
    const q = url.searchParams
    if (q.get('team')) list = list.filter(t => t.team === q.get('team'))
    if (q.get('priority')) list = list.filter(t => t.priority === q.get('priority'))
    if (q.get('q')) list = list.filter(t => `${t.title} ${t.description}`.toLowerCase().includes(q.get('q').toLowerCase()))
    return ok(res, 'Tasks retrieved successfully', list.map(t => taskOut(t)), 200, { meta: { total: list.length, page: 1, limit: 25, pages: 1 } })
  }
  if (key === 'POST /task/createTask') {
    const e = []
    if (!b.title || b.title.length < 2) e.push(['title', '"title" length must be at least 2 characters long'])
    const teamId = b.team || b.teamId || null
    const team = teamId ? db.teams.find(x => x._id === teamId && !x.deletedAt) : null
    if (teamId && !team) e.push(['team', 'team not found'])
    if (!validate(res, e)) return
    if (team && !isSA(me) && !(roleOf(me, team) === 'admin' || roleOf(me, team) === 'editor' || team.addedBy === me._id)) return err(res, 403, roleOf(me, team) === 'viewer' ? 'VIEWER_READ_ONLY' : 'FORBIDDEN', 'Viewers have read-only access')
    const t = { _id: id(), title: b.title, description: b.description || '', startDate: b.startDate || null, endDate: b.endDate || null, team: teamId, createdBy: me._id, priority: b.priority || '', tags: b.tags || [], recurrence: b.recurrence || 'none', remindBefore: b.remindBefore ?? 0, estimateMin: b.estimateMin || 0, archived: false, deletedAt: null, completedAt: null, createdAt: now(), updatedAt: now(),
      subtasks: (b.subtasks || []).map(s => typeof s === 'string' ? { _id: id(), text: s, done: false } : { _id: id(), text: s.text, done: !!s.done }) }
    db.tasks.push(t)
    for (const mid of b.assignees || []) { if (team && !team.members[mid]) continue; db.assignments.push({ _id: id(), task: t._id, member: mid, status: 'toDo', createdAt: now(), updatedAt: now() }); notify(mid, 'assigned', `You were assigned: ${t.title}`, t) }
    touch('tasks', t._id)
    return ok(res, 'Task created successfully', taskOut(t), 201)
  }
  if (key === 'POST /task/bulkDelete' || key === 'POST /task/bulkRestore') {
    const del = key.endsWith('Delete'); const done = [], skipped = []
    for (const i of b.ids || []) { const t = db.tasks.find(x => x._id === i); if (!t || !canManageTask(me, t)) { skipped.push({ id: i, code: 'FORBIDDEN' }); continue } t.deletedAt = del ? now() : null; touch('tasks', i); done.push(i) }
    return ok(res, del ? 'Tasks deleted' : 'Tasks restored', { [del ? 'deleted' : 'restored']: done, skipped })
  }
  const tm = path.match(/^\/task\/([0-9a-f]{24})(?:\/([a-zA-Z-]+))?(?:\/([0-9a-f]{24}))?$/)
  if (tm) {
    const [, tid, sub, sid] = tm
    const task = db.tasks.find(x => x._id === tid)
    if (!task || (task.deletedAt && sub !== 'restore')) return err(res, 404, 'TASK_NOT_FOUND', 'Task not found')
    if (!canRead(me, task)) return err(res, 403, 'FORBIDDEN', 'Forbidden')
    const bump = () => { task.updatedAt = now(); touch('tasks', tid) }
    if (!sub) {
      if (req.method === 'GET') return ok(res, 'Task retrieved', taskOut(task, true))
      if (req.method === 'PATCH') {
        if (!canManageTask(me, task)) { if (viewerBlock(res, me, task)) return; return err(res, 403, 'FORBIDDEN', 'Forbidden') }
        for (const k of ['title', 'description', 'startDate', 'endDate', 'priority', 'tags', 'recurrence', 'remindBefore', 'estimateMin', 'archived']) if (k in b) task[k] = b[k]
        if (b.team || b.teamId) task.team = b.team || b.teamId
        bump(); return ok(res, 'Task updated', taskOut(task))
      }
      if (req.method === 'DELETE') { if (!canManageTask(me, task)) return err(res, 403, 'FORBIDDEN', 'Forbidden'); task.deletedAt = now(); bump(); return ok(res, 'Task deleted', { _id: tid, deletedAt: task.deletedAt }) }
    }
    if (sub === 'share') {
      if (!canManageTask(me, task)) return err(res, 403, 'FORBIDDEN', 'Forbidden')
      if (req.method === 'POST') { task.shareToken = task.shareToken || id(); bump(); return ok(res, 'Share link created', { token: task.shareToken, url: `/public/task/${task.shareToken}` }) }
      if (req.method === 'DELETE') { task.shareToken = null; bump(); return ok(res, 'Share link revoked') }
    }
    if (sub === 'restore' && req.method === 'POST') { if (!canManageTask(me, task)) return err(res, 403, 'FORBIDDEN', 'Forbidden'); task.deletedAt = null; bump(); return ok(res, 'Task restored', taskOut(task)) }
    if (sub === 'complete-and-spawn' && req.method === 'POST') {
      db.assignments.filter(a => a.task === tid && (a.member === me._id || canManageTask(me, task))).forEach(a => { a.status = 'completed' })
      task.completedAt = now()
      let next = null
      if (task.recurrence !== 'none') {
        const shift = d => { if (!d) return d; const x = new Date(d); if (task.recurrence === 'daily') x.setDate(x.getDate() + 1); else if (task.recurrence === 'weekly') x.setDate(x.getDate() + 7); else x.setMonth(x.getMonth() + 1); return x.toISOString() }
        next = { ...task, _id: id(), startDate: shift(task.startDate), endDate: shift(task.endDate), completedAt: null, createdAt: now(), updatedAt: now(), subtasks: task.subtasks.map(s => ({ ...s, _id: id(), done: false })) }
        db.tasks.push(next)
        db.assignments.filter(a => a.task === tid).forEach(a => db.assignments.push({ _id: id(), task: next._id, member: a.member, status: 'toDo', createdAt: now(), updatedAt: now() }))
        task.recurrence = 'none'
      }
      bump(); if (next) touch('tasks', next._id)
      return ok(res, 'Task completed', { task: taskOut(task), next: next && taskOut(next) })
    }
    // everything below is a mutation by "contributors": viewers are blocked server-side
    if (sub === 'subtasks') {
      if (viewerBlock(res, me, task)) return
      if (req.method === 'POST') { const s = { _id: id(), text: b.text, done: false }; task.subtasks.push(s); bump(); return ok(res, 'Subtask added', s, 201) }
      const s = task.subtasks.find(x => x._id === sid)
      if (!s) return err(res, 404, 'NOT_FOUND', 'Subtask not found')
      if (req.method === 'PATCH') { if ('done' in b) s.done = !!b.done; if (b.text) s.text = b.text; bump(); return ok(res, 'Subtask updated', s) }
      if (req.method === 'DELETE') { task.subtasks = task.subtasks.filter(x => x !== s); bump(); return ok(res, 'Subtask removed') }
    }
    if (sub === 'comments') {
      if (req.method === 'GET') return ok(res, 'ok', db.comments.filter(c => c.task === tid))
      if (viewerBlock(res, me, task)) return
      if (req.method === 'POST') {
        if (!b.text || b.text.length > 2000) return validate(res, [['text', 'text must be 1-2000 characters']])
        const c = { _id: id(), task: tid, author: me._id, text: b.text, createdAt: now() }
        db.comments.push(c)
        for (const mm of db.members) if (mm._id !== me._id && b.text.includes('@' + mm.fname + mm.lname)) notify(mm._id, 'mention', `${me.fname} mentioned you in ${task.title}`, task)
        bump(); return ok(res, 'Comment added', { ...c, author: shortMember(me) }, 201)
      }
      const c = db.comments.find(x => x._id === sid)
      if (!c) return err(res, 404, 'NOT_FOUND', 'Comment not found')
      if (req.method === 'DELETE') { if (c.author !== me._id && !canManageTask(me, task)) return err(res, 403, 'FORBIDDEN', 'Forbidden'); db.comments = db.comments.filter(x => x !== c); bump(); return ok(res, 'Comment deleted') }
    }
    if (sub === 'attachments') {
      if (req.method === 'GET') return ok(res, 'ok', db.attachments.filter(a => a.task === tid))
      if (viewerBlock(res, me, task)) return
      if (req.method === 'POST') {
        const text = raw.toString('latin1')
        const fn = /filename="([^"]+)"/.exec(text)?.[1] || 'file'
        const a = { _id: id(), task: tid, name: fn, size: raw.length, mimeType: 'application/octet-stream', url: `http://localhost:${PORT}/files/${fn}`, uploadedBy: me._id, createdAt: now() }
        db.attachments.push(a); bump(); return ok(res, 'Attachment uploaded', [a], 201)
      }
      if (req.method === 'DELETE') { db.attachments = db.attachments.filter(x => x._id !== sid); bump(); return ok(res, 'Attachment deleted') }
    }
    if (sub === 'time') {
      if (req.method === 'GET') return ok(res, 'ok', db.times.filter(t => t.task === tid))
      if (viewerBlock(res, me, task)) return
      if (req.method === 'POST') {
        if (!Number.isInteger(b.minutes) || b.minutes < 1 || b.minutes > 1440) return validate(res, [['minutes', 'minutes must be an integer from 1 to 1440']])
        const e = { _id: id(), task: tid, author: me._id, minutes: b.minutes, note: b.note || '', at: b.at || now(), createdAt: now() }
        db.times.push(e); bump(); return ok(res, 'Time logged', { ...e, author: shortMember(me) }, 201)
      }
      if (req.method === 'DELETE') { db.times = db.times.filter(x => x._id !== sid); bump(); return ok(res, 'Time entry deleted') }
    }
  }

  // ---- assignments ----
  if (key === 'GET /taskAssignment' || key === 'GET /taskAssignment/all') return ok(res, 'ok', db.assignments.filter(a => { const t = db.tasks.find(x => x._id === a.task); return t && !t.deletedAt && canRead(me, t) }).map(asgOut))
  if (key === 'GET /taskAssignment/mine') return ok(res, 'ok', db.assignments.filter(a => a.member === me._id && !db.tasks.find(x => x._id === a.task)?.deletedAt).map(asgOut))
  if (key === 'POST /taskAssignment/addMemberToTask') {
    const task = db.tasks.find(t => t._id === b.taskId)
    if (!task) return err(res, 404, 'TASK_NOT_FOUND', 'Task not found')
    if (!canManageTask(me, task)) { if (viewerBlock(res, me, task)) return; return err(res, 403, 'FORBIDDEN', 'Forbidden') }
    const team = db.teams.find(t => t._id === task.team)
    const add = id1 => { const a = { _id: id(), task: task._id, member: id1, status: 'toDo', createdAt: now(), updatedAt: now() }; db.assignments.push(a); notify(id1, 'assigned', `You were assigned: ${task.title}`, task); return a }
    if (b.memberIds) {
      const added = [], skipped = []
      for (const m1 of b.memberIds) { if (db.assignments.some(a => a.task === task._id && a.member === m1)) skipped.push({ id: m1, code: 'ALREADY_ASSIGNED' }); else if (team && !team.members[m1]) skipped.push({ id: m1, code: 'NOT_TEAM_MEMBER' }); else { add(m1); added.push(m1) } }
      touch('tasks', task._id); return ok(res, 'Members assigned', { added, skipped })
    }
    if (db.assignments.some(a => a.task === task._id && a.member === b.memberId)) return err(res, 409, 'ALREADY_ASSIGNED', 'Member already assigned')
    const a = add(b.memberId); touch('tasks', task._id)
    return ok(res, 'Member assigned successfully', a, 201)
  }
  if (key === 'POST /taskAssignment/removeMemberFromTask') {
    const task = db.tasks.find(t => t._id === b.taskId)
    if (!task) return err(res, 404, 'TASK_NOT_FOUND', 'Task not found')
    if (!canManageTask(me, task)) return err(res, 403, 'FORBIDDEN', 'Forbidden')
    const ids = b.memberIds || [b.memberId]
    db.assignments = db.assignments.filter(a => !(a.task === task._id && ids.includes(a.member)))
    touch('tasks', task._id); return ok(res, 'Member removed from task')
  }
  if (key === 'PATCH /taskAssignment/taskStatusByMember') {
    const task = db.tasks.find(t => t._id === b.taskId)
    if (!task) return err(res, 404, 'TASK_NOT_FOUND', 'Task not found')
    if (viewerBlock(res, me, task)) return
    const target = (b.memberId && canManageTask(me, task)) ? b.memberId : me._id
    const a = db.assignments.find(x => x.task === task._id && x.member === target)
    if (!a) return err(res, 403, 'FORBIDDEN', 'You are not assigned to this task')
    const status = normStatus(b.status)
    if (!['toDo', 'inProgress', 'completed', 'failed'].includes(status)) return validate(res, [['status', 'invalid status']])
    a.status = status; a.updatedAt = now()
    task.completedAt = derived(task) === 'completed' ? now() : null
    touch('tasks', task._id)
    return ok(res, 'Status updated successfully', a)
  }
  if (key === 'POST /taskAssignment/bulkStatus') {
    const done = [], skipped = []
    for (const i of b.taskIds || []) { const a = db.assignments.find(x => x.task === i && x.member === me._id); if (!a) { skipped.push({ id: i, code: 'FORBIDDEN' }); continue } a.status = normStatus(b.status); done.push(i); touch('tasks', i) }
    return ok(res, 'Statuses updated', { updated: done, skipped })
  }

  // ---- notifications / templates / sync ----
  if (key === 'GET /notifications') { const list = db.notifs.filter(x => x.user === me._id).reverse(); return ok(res, 'ok', list, 200, { meta: { total: list.length, unread: list.filter(x => !x.readAt).length } }) }
  if (key === 'POST /notifications/read') { db.notifs.forEach(x => { if (x.user === me._id && (b.all || (b.ids || []).includes(x._id))) x.readAt = now() }); return ok(res, 'Marked as read') }
  if (key === 'GET /templates') return ok(res, 'ok', db.templates.filter(t => t.owner === me._id))
  if (key === 'POST /templates') { const t = { _id: id(), owner: me._id, ...b, createdAt: now() }; db.templates.push(t); return ok(res, 'Template saved', t, 201) }
  if (req.method === 'DELETE' && path.startsWith('/templates/')) { db.templates = db.templates.filter(t => t._id !== path.split('/')[2]); return ok(res, 'Template deleted') }
  if (key === 'GET /changes') {
    const since = new Date(url.searchParams.get('since') || 0).getTime()
    const out = { now: now(), tasks: { upserted: [], deleted: [] }, teams: { upserted: [], deleted: [] }, members: { upserted: [], deleted: [] }, assignments: { upserted: [], deleted: [] } }
    for (const c of db.changes) if (c.at > since && out[c.kind]) out[c.kind].upserted.push(c.id)
    return ok(res, 'Changes retrieved', out)
  }
  return err(res, 404, 'NOT_FOUND', `Not found: ${key}`)
}).listen(PORT, () => console.log(`mock backend on http://localhost:${PORT}`))
