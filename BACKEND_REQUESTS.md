# TaskVerse - everything we need from the backend (ONE file)

**For:** the backend developer. **From:** the frontend team. **This file replaces all earlier request files** (the first `BACKEND_REQUESTS.md`,
`BACKEND_ACCESS_CONTROL.md`, `BACKEND_ACTIVITY_ALERTS.md`, `BACKEND_TODO.md`). Work from this one only.
Basis: `TaskVerse_API_Documentation.md`. We have **no staging URL yet**, so everything was tested against `tests/mock-backend/server.mjs`
(a stand-in we wrote from your document). It proves our client follows the contract, not that your server does.

## How to read this file
| Part | What | Status for you |
|---|---|---|
| **Part 1** | Priority checklist (P0 -> P3) | **Start here.** Tick items off. |
| **Part 2** | Questions, contract gaps and what the frontend sends (the original request file) | Mostly already sent; items marked **NEW** were added later |
| **Part 3** | Roles & permissions - full specification (**NEW**: per-field task permissions, admin rules) | Needed for the admin "Access control" screen |
| **Part 4** | Board activity alerts - full specification (**NEW**) | Needed so admins are notified of everything that happens |

What we send back when you finish: staging URL, seed script, env var list, a changelog of anything that differs. We then run
`npx playwright test --project=integration` (21 backend tests) against it and report the same day.

---

# Part 1 - Priority checklist

### P0 - blocks real testing
- [ ] **Staging URL** + an admin account + seed data (6 members, 2 teams, 10 tasks, one viewer).
- [ ] **CORS**: add our deployed origin to `CORS_ORIGINS`; send `Access-Control-Expose-Headers: Date`.
- [ ] **`GET /member/profile` must return the system role** as exactly `admin` or `member` (lower case) and the `teams: [{teamId, name, role}]` array.
      We found that an admin whose role came back in another form was treated as a normal member and every task field was locked.
- [ ] **`createdBy`** must be present on every task from `GET /task` and `GET /task/:id` (id or `{_id}`).

### P0b - "Completed X / Y members" on every task (answer to *Frontend Updates - TaskVerse.md*)
The task card, list, board and assignment cards now show **Completed X / Y members** (X = assignees whose status is `complete`/`completed`, Y = everyone assigned to that task). The frontend counts from `GET /taskAssignment`.
That is only correct if the caller receives **every** assignment of a task. A plain member probably receives only their own, which would show `0 / 1` instead of `2 / 3`.
- [ ] Please confirm: does `GET /taskAssignment` return all assignments of the tasks the caller can see, or only the caller's? (Admin / team admin / plain member / viewer.)
- [ ] If only the caller's: add to each item of `GET /task` and `GET /task/:id` the numbers **`assigneesCount`** and **`completedCount`** (distinct assigned members / those whose status is completed). The frontend already prefers them when they are larger than what it can count itself, and refreshes `tasks` + `assignments` after every status change.
- [ ] Status values we send: `toDo | inProgress | complete | fail` (you accept `completed`/`failed` too). Tell us if a status moved by a *manager on behalf of another member* (`memberId` in `taskStatusByMember`) must also be allowed from the task card.

### P0c - admin cannot "move" a task to a team they are not in (found on the live site)
`PATCH /task/:id` with `{ "team": "<same team id>" }` returns **403 `You are not allowed to move tasks to this team`** for an admin who is not a member of that team (task created by another admin). The same call with any other field returns 200. Admins must be allowed everything: please skip the team-membership check for `role: admin`, and skip it entirely when the team id is unchanged. (The frontend now only sends the team when it changed.)
Also: `GET /team` returns both `teamAdims` (typo) and `teamAdmins`; please drop `teamAdims`. `GET /changes` returns 500 and `POST /activity/visit` returns 404 on the live backend.

### P1 - roles & permissions (the new admin console)
Spec: Part 3 of this file. Summary of what changed in this round:
- [ ] `GET /access/me`, `GET|PUT /access/config`, `GET /access/users`, `PUT /access/users/:id`, `GET /access/audit`.
- [ ] **Per-field task permissions** - the old `task.edit` is gone. `PATCH /task/:id` must check **each field in the body**:
      `title`->`task.editTitle`, `description`->`task.editDescription`, `startDate/endDate`->`task.editDates`, `team/teamId`->`task.editTeam`,
      `priority`->`task.editPriority`, `tags`->`task.editTags`, `recurrence`->`task.editRecurrence`, `remindBefore`->`task.editReminder`,
      `estimateMin`->`task.editEstimate`; subtask routes -> `task.editSubtasks`. Any missing key -> `403 PERMISSION_DENIED` + `permission`.
- [ ] **When access control is ON, the permission decides** (not "is the creator / team admin"). A member the admin allowed to edit a priority can do it on any task they can see.
- [ ] **A system admin can edit/delete/assign everything, including tasks created by other admins.** (A reported bug: an admin could only view another admin's task.)
- [ ] `PATCH /member/:id` accepts `role: 'admin'|'member'` (admins only); last admin cannot be demoted/deleted (`409 LAST_ADMIN`).
- [ ] Per-request permission resolution (not from the JWT), `access` group in `GET /changes`, audit rows for every change.
- [ ] Permission "sets" in the UI (Read only / Commenter / Contributor / Project manager) are saved as plain `allow`/`deny` lists through `PUT /access/users/:id` - nothing extra to build.

### P1b - board activity alerts (new)
Spec: `Part 4 of this file`. The admin and the task creator must be notified when someone opens a task, edits anything, comments, attaches, logs time, opens the board or joins.
- [ ] `POST /task/:id/view` and `POST /activity/visit` (new, de-duplicated per 30 min).
- [ ] Create a notification (`viewed`, `updated`, `status`, `completed`, `comment`, `attachment`, `subtask`, `time`, `board_visit`, `member_joined`, `team_member_added`) for every system admin + the task creator, never for the actor.
- [ ] Collapse bursts of edits (same person + task within 2 min = one notification); include `actor`, `code`, `params`.
- [ ] `notifications` group in `GET /changes`; push payload `{title, body, url}`; optional `activityViews/Changes/Joins` preference booleans.

### P2 - things that break in production
- [ ] **Uploads**: Vercel functions accept ~4.5 MB. Add signed direct upload: `POST /task/:id/attachments/sign` -> `{uploadUrl, fields, publicId}` and `POST /task/:id/attachments/confirm {publicId,name,size,mimeType}`.
- [ ] **Refresh token in an `HttpOnly; Secure; SameSite=None` cookie** (set by `/auth/signIn` and `/auth/refreshToken`, read by `/auth/refreshToken`). Tell us when ready and we stop storing it in the browser.
- [ ] **Cron**: add schedules to `vercel.json` (`/cron/reminders` hourly, `/cron/purge` daily); otherwise reminders and e-mail digests never run.
- [ ] Error middleware: unknown errors -> **500** with `code: "INTERNAL_ERROR"` (today 400).
- [ ] SSE is unreliable on Vercel (30 s limit). We poll `GET /changes` every 25 s; keep it fast and include `notifications` and `access` groups.

### P3 - features that are still computed in the browser
- [ ] `GET /activity?task=&team=&limit=` -> `[{_id, actor{_id,fname,lname}, action, text, task, team, createdAt}]` (feed + task card history).
- [ ] `GET /dashboard?team=` -> `totals, byStatus, byMember, time, burndown{from,to,ideal[],actual[]}` (we compute these locally today and download everything to do it).
- [ ] `GET /search?q=` grouped by `tasks`, `teams`, `members`.
- [ ] `GET /export/tasks.csv` and `report.pdf` with `Content-Disposition` filename.
- [ ] Notifications: return `code` + `params` next to `text` so Arabic users get translated messages; publish the full `type` list.
- [ ] Push payload shape `{title, body, url}` (we already handle `push` and `notificationclick`).
- [ ] Document: `confirmChangeEmail` request/response and what happens to a user's tasks when the account is deleted.


---

# Part 2 - Questions, gaps and contract (original request file)

### A. Needed to start real testing (blockers)

| # | Need | Why |
|---|---|---|
| A1 | **Staging base URL** + admin e-mail/password + a seeded workspace (6 members, 2 teams, 10 tasks incl. one recurring, one viewer account). | We run our 17 integration tests against it the same day. |
| A2 | Confirm **root paths vs `/api`** after the Vercel rewrite (`/task` and `/api/task` both work?). | We call root paths only. |
| A3 | **CORS**: your `CORS_ORIGINS` must contain our deployed origin, and responses must send `Access-Control-Expose-Headers: Date` (we use it for the first `/changes` cursor). | Browser blocks otherwise. |
| A4 | An **OpenAPI file generated from the running server** (not hand-written). | We diff it against our client automatically. |

### B. Behaviours we depend on - please confirm each (yes/no + sample JSON)

1. **Task list** (`GET /task`): does each item already contain `status` (derived), `assignees[{_id,fname,lname,email,status}]`, `team{_id,name}`, `priority`, `tags`, `recurrence`, `remindBefore`, `estimateMin`, `completedAt`, `subtasks[]`? We use them when present. If `subtasks` is only a count, say so.
2. **Task detail** (`GET /task/:id`): must include `comments[]`, `attachments[]`, `timeEntries[]`, `subtasks[]`, `shareToken`. Shapes we map: comment `{_id, author{_id,fname,lname}, text, createdAt}`, attachment `{_id,name,size,mimeType,url,uploadedBy,createdAt}`, time `{_id,author,minutes,note,at}`. Correct us if different.
3. **Create responses**: `POST .../subtasks`, `.../comments`, `.../time` return the created item (with `_id`) in `data`? (We replace our temporary id with it.) `POST .../attachments` returns the attachment(s) in `data`?
4. **`POST /task/:id/complete-and-spawn`**: does it (a) also mark the caller's assignment `completed`, (b) spawn **only if** `recurrence != none`, (c) set the old task's recurrence to `none`, (d) return `{task, next}`? **Does changing an assignment to `completed` via `taskStatusByMember` also spawn automatically?** If yes we would double-spawn. We currently: set status via `taskStatusByMember`, then call `complete-and-spawn`. Tell us which single call you prefer.
5. **Status**: we send `toDo | inProgress | complete | fail` (legacy words still normalised, as you documented). Can a member set `toDo` (move back)? We rely on yes.
6. **Roles in member list**: `GET /member` returns `teams:[{teamId, name, role}]` with `role` = `admin|editor|viewer`. We derive Viewer from this. Does `GET /member/profile` include the same `teams` array for the caller? (Needed to hide edit buttons for viewers.)
7. **`PATCH /task/:id`** with `{ team }` (or `teamId`) moves a task between teams - allowed for managers only?
8. **Bulk endpoints** result shapes: `addMemberToTask {memberIds}` -> `data.added[]` / `data.skipped[{id,code}]`; `bulkDelete`/`bulkRestore` -> `data.skipped[]`. We read exactly those keys.
9. **Notifications**: list item = `{_id, type, text, task{_id,title}, readAt, createdAt}`; `type` in `assigned|mention|comment|overdue|due_soon|reminder|...`. Please publish the full `type` list. `text` is English only; for Arabic users please also return `code` + `params` (e.g. `{code:'TASK_ASSIGNED', params:{title:'...'}}`) so we can translate.
10. **Unread count** (`meta.unread`) is still needed for the badge when we page.
11. **Sessions**: `GET /auth/sessions` item = `{_id, userAgent, ip, createdAt, lastUsedAt, current}`.
12. **Preferences**: `GET/PATCH /member/preferences` keys `emailAssigned, emailMention, emailDue, emailDigest` (booleans). The `push` and `quietHours` schemas are undocumented; we render only the four booleans.
13. **Templates**: `GET/POST/DELETE /templates` - we send `{name, scope:'user', title, description, priority, tags, recurrence, checklist[]}` and read the same back. Please confirm field names; `scope:'team'` needs `team`.
14. **Share link**: `POST /task/:id/share` returns `{ token, url }`. Our public page is `/share/:token` and calls `GET /public/task/:token` (title, description, status, dates, priority, subtasks). Is the response shape that?
15. **`GET /changes?since=`**: items under `upserted` are ids or full documents? Do assignments and **notifications** appear (we poll it every 25 s)? Include `notifications` as a fifth group so the bell updates live.
16. **Comment edit** (`PATCH`) rules and exact **@mention matching** (we render `@FirstLast`; the member list gives `fname`+`lname`).
17. Soft delete: how long can `restore` be called (we assume 30 days)? Do restored tasks keep assignees, comments, attachments?

### C. Problems we found reading the document

1. **Uploads will fail on Vercel**: a Function accepts ~4.5 MB bodies, but the document says 10 MB / file. Please add *signed direct upload*: `POST /task/:id/attachments/sign -> { uploadUrl, fields, publicId }` then `POST /task/:id/attachments/confirm {publicId,name,size,mimeType}`. We will switch as soon as it exists (today we send multipart and cap at 10 MB).
2. **SSE on Vercel**: `maxDuration: 30` kills the stream every 30 s and in-memory replay does not work across instances. We therefore poll `/changes` every 25 s (SSE is only attempted opportunistically). If you want true realtime: Upstash Redis pub/sub or Ably/Pusher - tell us the channel/auth format.
3. **Cron**: `/cron/reminders` and `/cron/purge` exist but `vercel.json` has no schedules. Add them (reminders hourly, purge daily). Without them reminders and e-mail digests never fire.
4. **Refresh tokens in localStorage** (what we do today) are readable by any XSS. Recommended: set the refresh token as an `HttpOnly; Secure; SameSite=None` cookie from `/auth/signIn` and `/auth/refreshToken`, accept it on `/auth/refreshToken`, and keep only the 20-minute access token in memory. Tell us when the cookie flow is ready and we switch.
5. **Error middleware falls back to HTTP 400** for unknown errors - please fall back to 500 and keep `code: "INTERNAL_ERROR"`; otherwise we cannot distinguish bad input from server bugs.
6. **Viewer rules** (section 13 of your doc): we show the Viewer as read-only and rely on `403 VIEWER_READ_ONLY` for every mutation: comment, subtask, attachment, time, status, assign. Please confirm each is actually enforced server-side (our mock does; the real one must).
7. **Document inconsistencies**: `GET /auth/profile` vs the earlier `POST /auth/profile`; two different rate limits mentioned across documents; `JWT` lifetime stated 20 min in one place only. Please state the single truth.

### D. Features that still have no backend contract (frontend is ready, please spec them)

| Feature | What we need |
|---|---|
| **Activity feed** | `GET /activity?task=&team=&limit=` -> `[{ _id, actor{_id,fname,lname}, action, text, task, team, createdAt }]`. Today the "Recent activity" panel and the task-card Activity list only show *this browser's* actions. |
| **Dashboard** | exact response of `GET /dashboard?team=` (`totals`, `byStatus`, `byMember`, `time`, `burndown{from,to,ideal[],actual[]}`). We compute it client-side now; with the server contract we switch and stop downloading everything. |
| **Server search** | grouped shape of `GET /search`. We filter locally today. |
| **Exports** | `GET /export/tasks.csv` and `report.pdf` content-types + filename header. We export what is loaded; large workspaces need these. |
| **Change e-mail / delete account** | request/response of `confirmChangeEmail`, and what happens to a user's tasks when an account is deleted. |
| **Push notifications** | `GET /push/key` works in the doc; tell us the payload your `web-push` sends (`{title, body, url}`) and we add the service-worker handler. |
| **Pagination** | when you add `meta`, keep the array response working for clients that do not send `page`. We already accept both. |

### D2. Access control (new, large) - see Part 3 of this file

The admin console (master ON/OFF switch, role presets, per-person Allow/Block, preview, history) is built and tested against a mock.
It needs `GET /access/me`, `GET|PUT /access/config`, `GET /access/users`, `PUT /access/users/:id`, `GET /access/audit`, and a
`403 PERMISSION_DENIED` check on the routes listed there. **Also needed now:** `PATCH /member/:id` must accept `role: 'admin'|'member'`
(admins only) - the member card's Admin/Member buttons send it and report an error if the server ignores it.

### E. What the frontend now does (so you know what to expect on the wire)

- Auth: sign-up -> OTP -> sign-in; `EMAIL_NOT_CONFIRMED` sends the user straight to the OTP screen; 401 with `INVALID_PASSWORD` never triggers a refresh/sign-out; one automatic refresh on an expired token; both tokens stored together.
- Lists: `GET /task`, `/team`, `/member`, `/taskAssignment`, `/notifications` accept a plain array **or** `{items}` + `meta`.
- Task create: **one** `POST /task/createTask` with `title, description, startDate, endDate, teamId, priority, tags, recurrence, subtasks[], assignees[]` (templates included).
- Team add/remove and task assign: **one request** with `memberIds[]`.
- Task card: optimistic UI, then `PATCH /task/:id` (priority, tags, recurrence, remindBefore, estimateMin), subtasks, comments, attachments (multipart `file`), time entries. If any call fails the task is re-fetched (`GET /task/:id`) so the screen never drifts.
- Delete is **immediate** and Undo calls `restore` (`/task/:id/restore`, `/task/bulkRestore`, `/team/restore`).
- Sync: `GET /changes?since=<cursor>` every 25 s while the tab is visible; only the lists that changed are reloaded; on 404/501 it falls back to a full refresh.
- Admin tools: `PATCH /member/:id`, `/member/:id/active`, `/member/:id/resetPassword`, `DELETE /member/:id`; sessions list + revoke; preferences; share link.

### F. Acceptance (our tests, run against your staging when A1 is done)

`npm run test:e2e` (`--project=integration` is the backend one). It must pass these:
sign-up/OTP/sign-in, error codes, token refresh, member create (409 `MEMBER_EXISTS`), team bulk add/remove (one request each) + Viewer role,
create task (one request, template fields), task-card write-through (priority, tag, subtask toggle, comment, time, attachment),
recurring completion, **viewer gets 403 `VIEWER_READ_ONLY` on comment/time/subtask/status**, delete + Undo, notifications + mark-read,
`/changes` live update, member admin (rename/deactivate -> `ACCOUNT_DEACTIVATED`/delete), sessions + preferences, share link + revoke, team delete + Undo, logout everywhere.
Send back: staging URL, seed script, env var list, and a changelog of anything that differs from your document.

---

# Part 3 - Roles & permissions (full specification)

### 1. What the admin can do (the product)

1. **Master switch** (ON / OFF) for the whole feature.
   - OFF: today's rules apply exactly as now (system admin / team manager / editor / viewer). Custom presets and per-person overrides are **kept but ignored**.
   - ON: every request is also checked against the caller's effective permissions (section 3).
2. **Roles** per person: **Admin**, **Member**, **Viewer** (read-only).
3. **Role presets**: for Member and Viewer, tick exactly which permissions the role has. Admin always has everything.
4. **Per-person overrides**: for one person, each permission can be `Default` (follow the role) / `Allow` (extra) / `Block` (removed).
5. **Preview as**: the admin can look at the app as another person (UI only, no backend call).
6. **History**: who changed what, and when.

### 2. Roles

| Role | Meaning | Source of truth |
|---|---|---|
| `admin` | System admin. All permissions, cannot be restricted. | `member.role === 'admin'` (already exists) |
| `viewer` | Read-only. | The person is `viewer` in **every** team they belong to (and is not a system admin) and belongs to at least one team. Team role `viewer` already exists. |
| `member` | Everyone else. | default |

The frontend changes roles with calls that already exist: system admin via `PATCH /member/:id { role: 'admin'|'member' }`
(**please support `role` there, admins only** - not in the current document) and viewer via
`POST /team/updateMemberRoleInTeam { role: 'viewer'|'editor' }` for each team. So you only need to *derive* the role as above.

Guard rails: an admin cannot change or delete **their own** role; the **last admin** can never be demoted or deleted (`409 LAST_ADMIN`).

### 3. Permission keys (fixed catalog - use these exact strings)

| Group | Key | Meaning |
|---|---|---|
| See | `view.overview` | Overview page |
| | `view.tasks` | Tasks list / board / calendar |
| | `view.teams` | Teams page |
| | `view.members` | Members directory |
| | `view.assignments` | "My assignments" |
| | `view.reports` | Dashboards, burn-down, workload, time reports |
| Tasks | `task.create` | Create tasks (also from templates) |
| | `task.delete` | Delete (soft delete) and bulk delete, restore |
| | `task.assign` | Add / remove assignees |
| | `task.status` | Change own assignment status, bulk status |
| | `task.comment` | Write / delete own comments |
| | `task.attach` | Upload / delete own attachments |
| | `task.logTime` | Log / delete own time entries |
| | `task.share` | Create / revoke public share links |
| Task fields | `task.editTitle` | Change `title` |
| | `task.editDescription` | Change `description` |
| | `task.editDates` | Change `startDate` / `endDate` |
| | `task.editTeam` | Change `team` / `teamId` (move between teams) |
| | `task.editPriority` | Change `priority` |
| | `task.editTags` | Change `tags` |
| | `task.editSubtasks` | Add / toggle / edit / delete subtasks |
| | `task.editRecurrence` | Change `recurrence` |
| | `task.editReminder` | Change `remindBefore` |
| | `task.editEstimate` | Change `estimateMin` |
| Teams & people | `team.create` | Create teams |
| | `team.manage` | Add/remove members, change team roles, rename |
| | `team.delete` | Delete / restore teams |
| | `member.invite` | Create member accounts |
| | `member.edit` | Rename, deactivate, reset password, delete, change system role |
| Data | `report.export` | CSV / PDF exports |

`access.manage` (this console) is **not** a key: only a system admin can use `/access/*`, always.

#### 3.1 Default presets (used until an admin changes them)

- **admin**: all keys (not editable).
- **member**: `view.overview view.tasks view.teams view.members view.assignments view.reports task.create task.status task.comment task.attach task.logTime task.share report.export`
- **viewer**: `view.overview view.tasks view.teams view.members view.assignments`

#### 3.2 Resolution (must be exactly this)

```
role      = admin | viewer | member            (section 2)
if role == admin                  -> everything allowed
set       = preset[role]
set      += overrides[user].allow
set      -= overrides[user].deny               (Block wins over Allow and over the preset)
allowed(key) = access.enabled == false  ? true  : set.has(key)
```
When `enabled == false` the **existing** authorization rules still apply (system admin / team manager / viewer).
When `enabled == true` **the permission decides**. The admin's choice replaces the old ownership rule (creator / team admin /
editor): a Member that the admin allowed `task.editPriority` can change the priority of **any task they can see**, not only their own.
Without the permission the answer is `403 PERMISSION_DENIED`. (Exceptions that never change: `403 VIEWER_READ_ONLY`, the last-admin
guard, and a person can only edit their *own* comments / attachments / time entries.)
A system admin (`role == 'admin'`) can do everything in every case, including editing tasks created by **other admins**.
Viewer team-role enforcement (`403 VIEWER_READ_ONLY`) stays as is.

### 4. Data model

```js
AccessConfig (single document)
  { _id, enabled: Boolean (default false),
    presets: { member: [key], viewer: [key] },      // admin is implicit
    updatedAt, updatedBy }

AccessOverride (one per person that has any override)
  { _id, member: ObjectId (unique), allow: [key], deny: [key], updatedAt, updatedBy }

AccessAudit (append-only)
  { _id, actor: ObjectId, action: 'access.enabled'|'access.disabled'|'preset.changed'|'override.changed'|'role.changed',
    target?: ObjectId, text: String, before?: Mixed, after?: Mixed, createdAt }
```
Validate keys against the catalog (ignore/reject unknown), de-duplicate, a key may not be in both `allow` and `deny`.
Deleting a member deletes their override.

### 5. Endpoints

All need `Authorization: Bearer`. Envelope `{ message, data }`, errors `{ message, code, ... }`.

| Method & path | Who | Body / result |
|---|---|---|
| `GET /access/me` | **any signed-in user** | `{ enabled, role: 'admin'\|'member'\|'viewer', permissions: [key] }` - the **effective** list, already resolved by the server (when `enabled=false` return the full catalog so the UI shows everything). The frontend calls this after every sign-in and on `/changes` events. |
| `GET /access/config` | admin | `{ enabled, rolePresets: { member:[key], viewer:[key] } }` |
| `PUT /access/config` | admin | body any of `{ enabled: Boolean, rolePresets: { member:[key], viewer:[key] } }` -> saved config. Audit entry per change. |
| `GET /access/users` | admin | `[ { memberId, allow:[key], deny:[key] } ]` (only people with overrides) |
| `PUT /access/users/:memberId` | admin | `{ allow:[key], deny:[key] }`; both empty = delete the override. Returns the saved document. `404 USER_NOT_FOUND`. |
| `GET /access/audit?limit=100` | admin | `[ { _id, actorName, text, createdAt } ]` newest first |
| `PATCH /member/:id` | admin | **add `role: 'admin'\|'member'`** (see section 2) |

Non-admin callers of `/access/config|users|audit` -> `403 FORBIDDEN`.

#### 5.1 Enforcement - add the permission check to these routes

Return `403 { code: 'PERMISSION_DENIED', message, permission: '<key>' }` when `access.enabled` and the key is missing.
Run the check **before** the existing authorization so the answer is consistent.

| Route(s) | Key |
|---|---|
| `GET /task`, `GET /task/:id`, `GET /taskAssignment*` | `view.tasks` (assignments list: `view.assignments` for `/taskAssignment/mine`) |
| `GET /team`, `GET /team/:id` | `view.teams` |
| `GET /member`, `GET /member/all` | `view.members` (always allow `GET /member/profile`) |
| `GET /dashboard*`, `GET /activity` (feed pages) | `view.reports` |
| `POST /task/createTask` | `task.create` |
| `PATCH /task/:id` | **one key per field in the body** (see the *Task fields* rows in section 3): a body that contains `priority` needs `task.editPriority`, `title` needs `task.editTitle`, and so on. If any field is not allowed, reject the whole request with `403 PERMISSION_DENIED` and `permission` = that key. |
| `POST/PATCH/DELETE /task/:id/subtasks*` | `task.editSubtasks` |
| `DELETE /task/:id`, `POST /task/:id/restore`, `POST /task/bulkDelete`, `POST /task/bulkRestore` | `task.delete` |
| `POST /taskAssignment/addMemberToTask`, `.../removeMemberFromTask` | `task.assign` |
| `PATCH /taskAssignment/taskStatusByMember`, `POST /taskAssignment/bulkStatus`, `POST /task/:id/complete-and-spawn` | `task.status` |
| `POST /task/:id/comments` (and own `PATCH`/`DELETE`) | `task.comment` |
| `POST /task/:id/attachments` (and own `DELETE`) | `task.attach` |
| `POST /task/:id/time` (and own `DELETE`) | `task.logTime` |
| `POST /task/:id/share`, `DELETE /task/:id/share` | `task.share` |
| `POST /team/createTeam` | `team.create` |
| `POST /team/addMemberToTeam`, `removeMemberFromTeam`, `updateMemberRoleInTeam`, `updateTeamName` | `team.manage` |
| `POST /team/deleteTeam`, `POST /team/restore` | `team.delete` |
| `POST /member/createMember` | `member.invite` |
| `PATCH/DELETE /member/:id`, `/member/:id/active`, `/member/:id/resetPassword` | `member.edit` (a person may always `PATCH` **their own** name/picture) |
| `GET /export/*` | `report.export` |

Notes
- A `view.*` key being blocked means the **data** is not returned: answer `403 PERMISSION_DENIED`, not an empty list, so the UI can tell "no access" from "nothing yet".
- Notifications, preferences, sessions, push and the person's own profile are never gated.
- SSE / `/changes`: only send events for entities the person may read.

### 6. Realtime and caching

- Add an `access` group to `GET /changes` (`{ upserted: ['config'|memberId], deleted: [] }`) and an SSE event `access.updated`, so a user whose permissions change sees the UI update without a reload (the frontend then re-calls `GET /access/me`).
- `GET /access/me` is cheap and may be cached for a few seconds per user; bust the cache on any `PUT /access/*` and on role changes.
- A permission change must apply to already-issued tokens immediately (resolve permissions per request from the database, not from the JWT).

### 7. Edge cases the tests will check

1. `enabled=false`: no `PERMISSION_DENIED` anywhere, even if overrides exist.
2. Block wins: preset has `task.create`, override `deny:['task.create']` -> 403; override `allow` + preset removed -> allowed.
3. Admin is never blocked, even if someone writes `deny` for an admin (store it, ignore it in resolution).
4. Changing the Member preset affects everyone with that role at once; overrides stay.
5. Viewer: `403 VIEWER_READ_ONLY` still wins on mutations even if the permission is `allow`.
6. Last admin cannot be demoted or deleted; nobody can change their own role.
7. Unknown permission key in a body -> `422 VALIDATION_ERROR`.
8. Deleting a member removes their override; re-creating the email starts clean.
9. Every change writes an audit row (who, what, before/after); `GET /access/audit` returns them newest first.
10. Concurrent edits: `PUT /access/users/:id` is last-write-wins but returns the saved state.

### 8. How we will verify

`tests/e2e/integration.spec.js`, test **"access control: master switch, per-person block, role presets, enforced by the server"**
(also `tests/e2e/more.spec.js` for the Demo Mode version). Point `VITE_API_BASE_URL` at your staging and run
`npx playwright test --project=integration`. It checks: switch on/off, a blocked person gets `403 PERMISSION_DENIED` with `permission: 'task.create'`,
`/access/me` of that person lacks the key, the Member preset change reaches `/access/me`, non-admins get 403 on `PUT /access/config`,
and turning the switch off lifts the restriction immediately.

Please send back: staging URL, any key you renamed or added (keep the strings in section 3 stable), and the migration notes.

---

# Part 4 - Board activity alerts (full specification)

### 1. Who gets notified
For every event below the recipients are: **every system admin + the task creator (`createdBy`)**, **minus the person who did it**.
(Optional later: team admins of the task's team.) Never notify someone about their own action.

### 2. Events and notification `type`
Use the normal `/notifications` document: `{ _id, type, text, task:{_id,title}, actor:{_id,fname,lname}, readAt, createdAt }`.
`text` is English, e.g. `"Sara Ali opened the task \"Design\""`. **Please also send `code` + `params`** (e.g. `{code:'TASK_VIEWED', params:{actor:'Sara Ali', title:'Design'}}`) so we can show Arabic.

| Event | `type` | Triggered by |
|---|---|---|
| Opened a task card | `viewed` | `POST /task/:id/view` (new, see 3) |
| Edited a field (title, description, dates, priority, tags, recurrence, reminder, estimate, team) | `updated` | `PATCH /task/:id` - say which fields changed in `text` |
| Status changed | `status` (`completed` when it becomes Completed) | `PATCH /taskAssignment/taskStatusByMember`, bulk status |
| Subtask added / ticked / removed | `subtask` | subtask routes |
| Comment added | `comment` | `POST /task/:id/comments` |
| File attached | `attachment` | `POST /task/:id/attachments` (name the file) |
| Time logged | `time` | `POST /task/:id/time` |
| Task created / deleted / restored | `task_created`, `task_deleted` | task routes (when created by someone else) |
| Assigned / removed | `assigned` (exists) | assignment routes |
| Someone opened the board | `board_visit` | `POST /activity/visit` (new) |
| A new person joined | `member_joined` (account confirmed) and `team_member_added` (added to a team) | `/auth/confirmEmail`, `POST /team/addMemberToTeam` |

The frontend colours/filters `viewed`, `updated|status|completed|attachment|subtask|time|task_created|task_deleted` and `board_visit|member_joined|team_member_added`.
Unknown types are shown as ordinary notifications.

### 3. New endpoints
| Method & path | Body | Notes |
|---|---|---|
| `POST /task/:id/view` | `{}` | Records that the caller opened the card. **Rate-limit / de-duplicate on the server too**: one `viewed` notification per (person, task) per 30 minutes (the client already sends at most one per 30 min per task per browser). Answer `200`, never an error for a deleted/unreadable task (use `404`/`403` normally). Not gated by any permission. |
| `POST /activity/visit` | `{}` | The caller opened the board (sent once per browser session after sign-in). De-duplicate: one `board_visit` per person per 30 minutes. |

### 4. Anti-spam rules (please implement)
- **Collapse bursts**: several edits to the same task by the same person within 2 minutes -> **one** notification (update its text/time instead of inserting more).
- Do not notify for automatic changes (recurring task spawn, cron).
- Keep `GET /notifications` paginated; the bell shows the latest 50.

### 5. Per-user switches (optional, recommended)
The client lets each user turn groups off **on their own device** (Profile -> *Board activity alerts*: `views`, `changes`, `joins`).
For e-mail / push to respect that too, please extend `GET/PATCH /member/preferences` with booleans
`activityViews`, `activityChanges`, `activityJoins` (default `true`) and skip sending those pushes/e-mails when `false`. Tell us when ready and we send them.

### 6. Realtime
`GET /changes` must include the `notifications` group whenever a notification is created for the caller, so the bell updates without a reload.
Web Push payload: `{ title, body, url }` where `url` is `/app?tab=Tasks&task=<id>` when there is a task.

### 7. How we verify
`tests/e2e/integration.spec.js`, test **"board activity: ..."**. As member M2 it calls `POST /task/:id/view`, changes a status, posts a comment and calls
`POST /activity/visit`; then the admin's bell must show *opened the task*, *changed the status*, *commented on* and *opened the board*, and switching the
"Someone opened a task" group off hides only the first one.
