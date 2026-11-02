# Backend hand-off — what the frontend needs, in build order

Audience: the developer of the TaskVerse backend (Node/Express/Mongoose assumed from the existing routes such as
`/auth/signIn`, `/task/createTask`, `/taskAssignment/addMemberToTask` and Mongo-style `_id`s; adapt the snippets if the stack differs).
Companion file: [BACKEND_API_SPEC.md](BACKEND_API_SPEC.md) lists every field/route in reference form. This file is the **plan + code**.

Everything below is currently **simulated in the browser** (`src/services/extras.js`, `src/services/realtime.js`), so the UI already works
and only needs to be pointed at real endpoints. Each phase says which frontend function to swap.

---

## Phase 0 — Fix the contract the UI already calls (½ day)

| Route | Why | Frontend caller |
|---|---|---|
| `PATCH /task/:id` | edit title/description/dates/team | `api.updateTask` |
| `POST /taskAssignment/removeMemberFromTask` `{taskId, memberId}` | remove assignee | `api.removeMemberFromTask` |
| `POST /task/createTask` returns the created doc (`data._id`) | assign members / apply template right after create | `createTask()`, `spawnNextOccurrence()` |
| `addMemberToTask` / `addMemberToTeam` accept `memberIds: []` (optional) | bulk without N round-trips | `bulk()` helper |

## Phase 1 — Permissions (viewer / editor / admin) — **security critical** (1 day)

The UI hides actions from viewers but that is cosmetic. Enforce on the server:

```js
// models/Team.js — extend the member role enum
members: [{ member: { type: ObjectId, ref: 'Member' }, role: { type: String, enum: ['admin', 'editor', 'viewer'], default: 'editor' } }]
// migration: UPDATE role 'member' -> 'editor'
```
```js
// middleware/teamRole.js
const RANK = { viewer: 1, editor: 2, admin: 3 }
exports.requireTeamRole = (min) => async (req, res, next) => {
  if (req.user.role === 'admin') return next()                       // system admin
  const task = req.task || await Task.findById(req.params.taskId || req.params.id)
  if (!task) return res.status(404).json({ message: 'Task not found' })
  const team = await Team.findById(task.team)
  const me = team?.members.find(m => String(m.member) === String(req.user._id))
  if (!me || RANK[me.role] < RANK[min]) return res.status(403).json({ message: 'Your team role does not allow this' })
  req.task = task; req.teamRole = me.role
  next()
}
// usage
router.patch('/task/:id', auth, requireTeamRole('admin'), updateTask)        // or: creator || team admin
router.patch('/taskAssignment/taskStatusByMember', auth, requireTeamRole('editor'), setStatus)
router.post('/task/:id/comments', auth, requireTeamRole('editor'), addComment)
router.post('/task/:id/attachments', auth, requireTeamRole('editor'), upload.single('file'), addAttachment)
router.post('/task/:id/time', auth, requireTeamRole('editor'), addTime)
router.get('/task/:id', auth, requireTeamRole('viewer'), getTask)            // viewers can read
```
Also: `updateMemberRoleInTeam` / `addMemberToTeam` accept `role: 'admin'|'editor'|'viewer'`.
**Tests to write:** viewer gets 403 on every write route above; editor gets 403 on `PATCH /task/:id` unless creator; admin passes.

## Phase 2 — Task extras (priority, tags, subtasks, recurrence, reminder, estimate, completedAt) (1–2 days)

```js
// models/Task.js — add
priority:   { type: String, enum: ['', 'low', 'medium', 'high', 'urgent'], default: '' },
tags:       { type: [{ type: String, maxlength: 24 }], validate: v => v.length <= 10 },
subtasks:   [{ text: { type: String, maxlength: 140, required: true }, done: { type: Boolean, default: false } }],
recurrence: { type: String, enum: ['none', 'daily', 'weekly', 'monthly'], default: 'none' },
remindBefore: { type: Number, default: 2, min: 0, max: 30 },     // days; 0 = off
estimateMin:  { type: Number, default: 0, min: 0 },
completedAt:  Date,                                                // set when the last assignment becomes 'complete'
```
Routes: `PATCH /task/:id` accepts all of the above; `POST/PATCH/DELETE /task/:id/subtasks[/:subId]`.
Joi: reject unknown fields only on the *new* routes so older clients keep working.

**Recurrence on the server** (replace `spawnNextOccurrence()` in the UI):
```js
async function onTaskCompleted(task) {
  if (task.recurrence === 'none') return
  const shift = d => { const x = new Date(d); task.recurrence === 'daily' ? x.setDate(x.getDate()+1) : task.recurrence === 'weekly' ? x.setDate(x.getDate()+7) : x.setMonth(x.getMonth()+1); return x }
  const next = await Task.create({ ...pick(task, ['title','description','team','priority','tags','remindBefore','recurrence','estimateMin','createdBy']),
    startDate: shift(task.startDate), endDate: shift(task.endDate), subtasks: task.subtasks.map(s => ({ text: s.text, done: false })) })
  await TaskAssignment.insertMany(await TaskAssignment.find({ task: task._id }).then(a => a.map(x => ({ task: next._id, member: x.member, status: 'inProgress' }))))
  await Task.updateOne({ _id: task._id }, { recurrence: 'none' })     // the chain continues on `next`
  hub.publish(task.team, { type: 'task.created', taskId: next._id })
}
```
**Frontend swap:** in `WorkspaceView.vue` delete `spawnNextOccurrence` calls and the `extras.setPriority/…` calls; read the fields from the task payload.

## Phase 3 — Comments, mentions, attachments, time entries (2 days)

```js
const Comment = new Schema({ task: { type: ObjectId, index: true }, author: { type: ObjectId, ref: 'Member' }, text: { type: String, maxlength: 500 }, mentions: [ObjectId] }, { timestamps: true })
const TimeEntry = new Schema({ task: { type: ObjectId, index: true }, member: { type: ObjectId, ref: 'Member', index: true }, minutes: { type: Number, min: 1, max: 24*60 }, note: String, startedAt: Date }, { timestamps: true })
const Attachment = new Schema({ task: ObjectId, name: String, size: Number, mimeType: String, url: String, storageKey: String, uploadedBy: ObjectId }, { timestamps: true })
```
| Route | Notes |
|---|---|
| `GET/POST /task/:id/comments`, `DELETE /task/:id/comments/:cid` | on POST parse `@FirstLast` handles (name without spaces, case-insensitive) → resolve to team members → store `mentions[]` → create `mention` notification |
| `POST /task/:id/attachments` (multipart) | validate size ≤ 10 MB and an allow-list of mime types; upload to S3/Cloudinary; **never** serve user files from your own origin with their original content-type (`Content-Disposition: attachment` or a separate domain) |
| `GET/POST /task/:id/time`, `DELETE /task/:id/time/:eid` | plus `POST /task/:id/timer/start` and `/stop` (server stores `timerStartedAt` per member, so a timer survives a browser refresh and works across devices) |
| `GET /reports/time?teamId=&from=&to=` | `[{ member, minutes }]` and per-task totals (aggregation on `TimeEntry`) |

## Phase 4 — Activity log + notifications (1–2 days)

```js
const Activity = new Schema({ actor: ObjectId, team: { type: ObjectId, index: true }, task: ObjectId, action: String, meta: Object }, { timestamps: true })
const Notification = new Schema({ user: { type: ObjectId, index: true }, type: { type: String, enum: ['assigned','due_soon','overdue','comment','mention','status'] },
  task: ObjectId, text: String, readAt: Date }, { timestamps: true })
```
Write an `Activity` row from one place (a service method used by every mutating controller) — not from each route by hand.
Routes: `GET /activity?teamId=&taskId=&limit=50`, `GET /notifications?unread=true`, `POST /notifications/read {ids|'all'}`.

**Reminders / due-soon / overdue (cron, daily or hourly):**
```js
// Vercel Cron / node-cron
const tasks = await Task.find({ completedAt: null, remindBefore: { $gt: 0 } })
for (const t of tasks) {
  const daysLeft = Math.ceil((t.endDate - Date.now()) / 864e5)
  if (daysLeft <= t.remindBefore) await notifyAssignees(t, daysLeft < 0 ? 'overdue' : 'due_soon')   // dedupe on (task,type,date)
}
```
Email via the existing nodemailer setup on: assignment, due-soon, overdue, mention; add `User.emailNotifications: Boolean` (default true) for opt-out.
Web push (optional): `web-push` + `POST /push/subscribe`; the service worker in `public/sw.js` needs a `push` handler (frontend task, tell us when ready).

## Phase 5 — Real-time (SSE) (1 day)

The client (`src/services/realtime.js`) connects to **`GET /events`** with `Authorization: Bearer <token>` and `Accept: text/event-stream`,
reads the stream with `fetch`, auto-reconnects with back-off and falls back to 30 s polling if the endpoint is missing.

```js
// realtime/hub.js
const clients = new Map()                       // userId -> Set(res)
exports.subscribe = (userId, res) => { (clients.get(userId) || clients.set(userId, new Set()).get(userId)).add(res); res.on('close', () => clients.get(userId)?.delete(res)) }
exports.publishToUsers = (userIds, evt) => userIds.forEach(id => clients.get(String(id))?.forEach(res => res.write(`data: ${JSON.stringify(evt)}\n\n`)))
exports.publish = async (teamId, evt) => exports.publishToUsers((await Team.findById(teamId)).members.map(m => String(m.member)), evt)

// routes/events.js
router.get('/events', auth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders()
  res.write(': connected\n\n')
  const beat = setInterval(() => res.write(': ping\n\n'), 25_000)           // keeps proxies from closing the stream
  hub.subscribe(String(req.user._id), res)
  req.on('close', () => clearInterval(beat))
})
```
Event shape (all optional except `type`): `{ type: 'task.created|task.updated|task.deleted|assignment.changed|team.updated|member.updated|comment.created', actorId, message, taskId, teamId }`.
The UI refetches the affected collections (debounced) and, if `message` is set and `actorId` isn't the viewer, shows it as a toast.
Publish from the same service layer that writes `Activity`.

**Hosting caveat:** SSE needs a long-lived connection. Vercel serverless functions time out (use the *Node runtime with streaming + `maxDuration`*, or host the API on Render/Railway/Fly/a VPS). With more than one server instance, fan out through Redis pub/sub (you already use Upstash — publish on a `team:<id>` channel and have each instance forward to its local clients).
CORS: allow the `Authorization` header and expose nothing special; no cookies are used.

## Phase 6 — Aggregation endpoints for the dashboards (½ day, optional optimization)

The UI computes the team dashboard and burn-down from already-loaded tasks. For large teams add:
`GET /teams/:id/dashboard` → `{ totals, overdue, byMember: [{ member, open, done, late, minutes }], burndown: [{ date, remaining }] }`
(`remaining` per day = tasks with `createdAt <= day` and (`completedAt` null or `> day`)).

## Phase 7 — Templates (optional, ½ day)

Templates are stored per browser today (5 built-in + custom). To share them: `Template { team, name, title, description, priority, tags, recurrence, durationDays, subtasks[] }`
with `GET/POST/DELETE /templates?teamId=`. Frontend swap: `templateStore` in `extras.js`.

## Phase 8 — Hardening checklist

- [ ] Rate-limit comment / attachment / time endpoints; cap payload sizes.
- [ ] Sanitize nothing on write — the UI escapes on render — but **do** validate lengths and reject control characters.
- [ ] Soft-delete tasks (`deletedAt`) for 30 days so admins can recover beyond the UI's 8-second undo.
- [ ] Index: `Task(team,endDate)`, `Comment(task,createdAt)`, `TimeEntry(task)`, `Notification(user,readAt)`, `Activity(team,createdAt)`.
- [ ] Contract tests for every route in this file (the frontend Playwright suite mocks `/events`, `/task/`, `/team/`, `/auth/profile` in `tests/e2e/more.spec.js` — mirror those shapes).

### Suggested order & rough effort
Phase 0 → 1 → 2 → 5 (SSE) → 3 → 4 → 6/7. Phases 0–2 unblock correctness and security; 5 makes the app feel live; 3–4 make the collaboration features shared.
