# TaskVerse - round 2: what the frontend needs from the backend

**For:** the backend developer. **From:** the frontend team.
**Basis:** `TaskVerse_API_Documentation.md` (your latest document). The frontend is now wired to it end to end.
**Important:** we still have **no staging URL**, so everything below was tested against `tests/mock-backend/server.mjs`,
a stand-in we wrote *from your document*. It proves the frontend follows the contract; it does **not** prove your server does.
The first thing we need is a staging URL and an admin account (A1).

---

## A. Needed to start real testing (blockers)

| # | Need | Why |
|---|---|---|
| A1 | **Staging base URL** + admin e-mail/password + a seeded workspace (6 members, 2 teams, 10 tasks incl. one recurring, one viewer account). | We run our 17 integration tests against it the same day. |
| A2 | Confirm **root paths vs `/api`** after the Vercel rewrite (`/task` and `/api/task` both work?). | We call root paths only. |
| A3 | **CORS**: your `CORS_ORIGINS` must contain our deployed origin, and responses must send `Access-Control-Expose-Headers: Date` (we use it for the first `/changes` cursor). | Browser blocks otherwise. |
| A4 | An **OpenAPI file generated from the running server** (not hand-written). | We diff it against our client automatically. |

## B. Behaviours we depend on - please confirm each (yes/no + sample JSON)

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

## C. Problems we found reading the document

1. **Uploads will fail on Vercel**: a Function accepts ~4.5 MB bodies, but the document says 10 MB / file. Please add *signed direct upload*: `POST /task/:id/attachments/sign -> { uploadUrl, fields, publicId }` then `POST /task/:id/attachments/confirm {publicId,name,size,mimeType}`. We will switch as soon as it exists (today we send multipart and cap at 10 MB).
2. **SSE on Vercel**: `maxDuration: 30` kills the stream every 30 s and in-memory replay does not work across instances. We therefore poll `/changes` every 25 s (SSE is only attempted opportunistically). If you want true realtime: Upstash Redis pub/sub or Ably/Pusher - tell us the channel/auth format.
3. **Cron**: `/cron/reminders` and `/cron/purge` exist but `vercel.json` has no schedules. Add them (reminders hourly, purge daily). Without them reminders and e-mail digests never fire.
4. **Refresh tokens in localStorage** (what we do today) are readable by any XSS. Recommended: set the refresh token as an `HttpOnly; Secure; SameSite=None` cookie from `/auth/signIn` and `/auth/refreshToken`, accept it on `/auth/refreshToken`, and keep only the 20-minute access token in memory. Tell us when the cookie flow is ready and we switch.
5. **Error middleware falls back to HTTP 400** for unknown errors - please fall back to 500 and keep `code: "INTERNAL_ERROR"`; otherwise we cannot distinguish bad input from server bugs.
6. **Viewer rules** (section 13 of your doc): we show the Viewer as read-only and rely on `403 VIEWER_READ_ONLY` for every mutation: comment, subtask, attachment, time, status, assign. Please confirm each is actually enforced server-side (our mock does; the real one must).
7. **Document inconsistencies**: `GET /auth/profile` vs the earlier `POST /auth/profile`; two different rate limits mentioned across documents; `JWT` lifetime stated 20 min in one place only. Please state the single truth.

## D. Features that still have no backend contract (frontend is ready, please spec them)

| Feature | What we need |
|---|---|
| **Activity feed** | `GET /activity?task=&team=&limit=` -> `[{ _id, actor{_id,fname,lname}, action, text, task, team, createdAt }]`. Today the "Recent activity" panel and the task-card Activity list only show *this browser's* actions. |
| **Dashboard** | exact response of `GET /dashboard?team=` (`totals`, `byStatus`, `byMember`, `time`, `burndown{from,to,ideal[],actual[]}`). We compute it client-side now; with the server contract we switch and stop downloading everything. |
| **Server search** | grouped shape of `GET /search`. We filter locally today. |
| **Exports** | `GET /export/tasks.csv` and `report.pdf` content-types + filename header. We export what is loaded; large workspaces need these. |
| **Change e-mail / delete account** | request/response of `confirmChangeEmail`, and what happens to a user's tasks when an account is deleted. |
| **Push notifications** | `GET /push/key` works in the doc; tell us the payload your `web-push` sends (`{title, body, url}`) and we add the service-worker handler. |
| **Pagination** | when you add `meta`, keep the array response working for clients that do not send `page`. We already accept both. |

## D2. Access control (new, large) - see `BACKEND_ACCESS_CONTROL.md`

The admin console (master ON/OFF switch, role presets, per-person Allow/Block, preview, history) is built and tested against a mock.
It needs `GET /access/me`, `GET|PUT /access/config`, `GET /access/users`, `PUT /access/users/:id`, `GET /access/audit`, and a
`403 PERMISSION_DENIED` check on the routes listed there. **Also needed now:** `PATCH /member/:id` must accept `role: 'admin'|'member'`
(admins only) - the member card's Admin/Member buttons send it and report an error if the server ignores it.

## E. What the frontend now does (so you know what to expect on the wire)

- Auth: sign-up -> OTP -> sign-in; `EMAIL_NOT_CONFIRMED` sends the user straight to the OTP screen; 401 with `INVALID_PASSWORD` never triggers a refresh/sign-out; one automatic refresh on an expired token; both tokens stored together.
- Lists: `GET /task`, `/team`, `/member`, `/taskAssignment`, `/notifications` accept a plain array **or** `{items}` + `meta`.
- Task create: **one** `POST /task/createTask` with `title, description, startDate, endDate, teamId, priority, tags, recurrence, subtasks[], assignees[]` (templates included).
- Team add/remove and task assign: **one request** with `memberIds[]`.
- Task card: optimistic UI, then `PATCH /task/:id` (priority, tags, recurrence, remindBefore, estimateMin), subtasks, comments, attachments (multipart `file`), time entries. If any call fails the task is re-fetched (`GET /task/:id`) so the screen never drifts.
- Delete is **immediate** and Undo calls `restore` (`/task/:id/restore`, `/task/bulkRestore`, `/team/restore`).
- Sync: `GET /changes?since=<cursor>` every 25 s while the tab is visible; only the lists that changed are reloaded; on 404/501 it falls back to a full refresh.
- Admin tools: `PATCH /member/:id`, `/member/:id/active`, `/member/:id/resetPassword`, `DELETE /member/:id`; sessions list + revoke; preferences; share link.

## F. Acceptance (our tests, run against your staging when A1 is done)

`npm run test:e2e` (`--project=integration` is the backend one). It must pass these:
sign-up/OTP/sign-in, error codes, token refresh, member create (409 `MEMBER_EXISTS`), team bulk add/remove (one request each) + Viewer role,
create task (one request, template fields), task-card write-through (priority, tag, subtask toggle, comment, time, attachment),
recurring completion, **viewer gets 403 `VIEWER_READ_ONLY` on comment/time/subtask/status**, delete + Undo, notifications + mark-read,
`/changes` live update, member admin (rename/deactivate -> `ACCOUNT_DEACTIVATED`/delete), sessions + preferences, share link + revoke, team delete + Undo, logout everywhere.
Send back: staging URL, seed script, env var list, and a changelog of anything that differs from your document.
