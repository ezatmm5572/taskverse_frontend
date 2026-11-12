# TaskVerse - backend to-do list (single page, in priority order)

**For:** the backend developer. **From:** the frontend team.
Details live in `BACKEND_ACCESS_CONTROL.md` (permissions) and `BACKEND_REQUESTS.md` (questions + contract gaps).
This page is the checklist: tick items off and send us the staging URL.

## P0 - blocks real testing
- [ ] **Staging URL** + an admin account + seed data (6 members, 2 teams, 10 tasks, one viewer).
- [ ] **CORS**: add our deployed origin to `CORS_ORIGINS`; send `Access-Control-Expose-Headers: Date`.
- [ ] **`GET /member/profile` must return the system role** as exactly `admin` or `member` (lower case) and the `teams: [{teamId, name, role}]` array.
      We found that an admin whose role came back in another form was treated as a normal member and every task field was locked.
- [ ] **`createdBy`** must be present on every task from `GET /task` and `GET /task/:id` (id or `{_id}`).

## P1 - roles & permissions (the new admin console)
Spec: `BACKEND_ACCESS_CONTROL.md`. Summary of what changed in this round:
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

## P2 - things that break in production
- [ ] **Uploads**: Vercel functions accept ~4.5 MB. Add signed direct upload: `POST /task/:id/attachments/sign` -> `{uploadUrl, fields, publicId}` and `POST /task/:id/attachments/confirm {publicId,name,size,mimeType}`.
- [ ] **Refresh token in an `HttpOnly; Secure; SameSite=None` cookie** (set by `/auth/signIn` and `/auth/refreshToken`, read by `/auth/refreshToken`). Tell us when ready and we stop storing it in the browser.
- [ ] **Cron**: add schedules to `vercel.json` (`/cron/reminders` hourly, `/cron/purge` daily); otherwise reminders and e-mail digests never run.
- [ ] Error middleware: unknown errors -> **500** with `code: "INTERNAL_ERROR"` (today 400).
- [ ] SSE is unreliable on Vercel (30 s limit). We poll `GET /changes` every 25 s; keep it fast and include `notifications` and `access` groups.

## P3 - features that are still computed in the browser
- [ ] `GET /activity?task=&team=&limit=` -> `[{_id, actor{_id,fname,lname}, action, text, task, team, createdAt}]` (feed + task card history).
- [ ] `GET /dashboard?team=` -> `totals, byStatus, byMember, time, burndown{from,to,ideal[],actual[]}` (we compute these locally today and download everything to do it).
- [ ] `GET /search?q=` grouped by `tasks`, `teams`, `members`.
- [ ] `GET /export/tasks.csv` and `report.pdf` with `Content-Disposition` filename.
- [ ] Notifications: return `code` + `params` next to `text` so Arabic users get translated messages; publish the full `type` list.
- [ ] Push payload shape `{title, body, url}` (we already handle `push` and `notificationclick`).
- [ ] Document: `confirmChangeEmail` request/response and what happens to a user's tasks when the account is deleted.

## What we send back when you finish
Staging URL, seed script, env var list, and a changelog of anything that differs from the documents. We then run
`npx playwright test --project=integration` against it (24 backend tests) and report the same day.
