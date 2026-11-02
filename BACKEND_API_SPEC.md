# Backend contract for the features currently stored client-side

The frontend keeps these in `src/services/extras.js` (localStorage, per browser) because the
backend has no endpoints for them yet. To share them between users, implement the routes below
and replace the body of `extras.js` with API calls (the rest of the UI only talks to that module).

All routes: `Authorization: Bearer <accessToken>`, JSON bodies, same error shape as the rest of the API
(`{ message }` or Joi `{ message, errors: [...] }`).

## Task fields (extend the Task model)
| Field | Type | Notes |
|---|---|---|
| `priority` | `'low'｜'medium'｜'high'｜'urgent'｜''` | default `''` |
| `tags` | `string[]` (max 10, each ≤ 24 chars) | |
| `subtasks` | `[{ _id, text, done }]` | |

- `PATCH /task/:taskId` – update `title, description, startDate, endDate, team, priority, tags`
  (allowed for system admin, task creator, team owner/admin — same rule as delete).
- `POST /task/:taskId/subtasks` `{ text }` · `PATCH /task/:taskId/subtasks/:subId` `{ done?, text? }` · `DELETE /task/:taskId/subtasks/:subId`

## Assignments
- `POST /taskAssignment/removeMemberFromTask` `{ taskId, memberId }` – same permission as `addMemberToTask`.
- `POST /taskAssignment/addMemberToTask` already exists; optionally accept `memberIds: []` for bulk assign.
- `POST /team/addMemberToTeam` / `removeMemberFromTeam`: optionally accept `memberIds: []` for bulk.
- `POST /task/createTask` should return the created task (`data._id`) so the UI can assign members right after creation
  (or accept `assignees: [memberId]`).

## Comments
- `GET /task/:taskId/comments` → `[{ _id, author: {_id,fname,lname}, text, createdAt }]`
- `POST /task/:taskId/comments` `{ text }` (≤ 500 chars; caller must be able to see the task)
- `DELETE /task/:taskId/comments/:commentId` (author, or task manager)

## Attachments
- `POST /task/:taskId/attachments` (multipart `file`) → upload to S3/Cloudinary, store `{ _id, name, size, mimeType, url, uploadedBy, createdAt }`; limit size/type server-side.
- `GET /task/:taskId/attachments`, `DELETE /task/:taskId/attachments/:attId` (uploader, or task manager)

## Activity log
- Write an entry on every mutation: `{ actor, action, task?, team?, meta, createdAt }`.
- `GET /activity?taskId=&teamId=&limit=50` → newest first (the Overview "Recent activity" and the task card use this).

## Notifications (replaces the derived list in the bell)
- Model: `{ _id, user, type: 'assigned'｜'due_soon'｜'overdue'｜'comment'｜'status', task, text, readAt, createdAt }`
- `GET /notifications?unread=true` · `POST /notifications/read` `{ ids: [] | 'all' }`
- Push live with SSE (`GET /notifications/stream`) or WebSocket.
- Email: send via the existing mailer when (a) a member is assigned, (b) a task is due in 24h (daily cron / Vercel Cron), (c) someone comments on a task you're assigned to. Add a per-user opt-out flag.

## Recurrence & reminders (task fields)
- `recurrence`: `'none'｜'daily'｜'weekly'｜'monthly'`; `remindBefore`: days (`0` = off).
- Preferred: do the spawn **server-side** when a task becomes `complete` — create the next task with `startDate/endDate` shifted by the interval,
  copy `team, priority, tags, recurrence, remindBefore`, reset subtasks to `done:false`, re-assign the same members, then set the finished task's
  `recurrence` to `none`. (The UI currently does this client-side after the status change.)
- A daily cron (e.g. Vercel Cron) should create `due_soon` notifications/emails for tasks whose `endDate - remindBefore days <= today`.

## Mentions
- Comments may contain `@FirstLast` handles (name without spaces). Server: parse them, resolve to members of the task's team, create a `mention` notification (+ email).

## Team roles (viewer / editor / admin)
- Extend the team-member role enum to `'admin'｜'editor'｜'viewer'` (today: `admin｜member`; `member` == `editor`).
- **Enforce on the server**: viewers may read the team's tasks but cannot create/update/delete tasks, change status, comment, attach or be required to act.
  The UI hides these actions for viewers but that is not a security boundary.
- `POST /team/updateMemberRoleInTeam` `{ teamId, memberId, role }` should accept the new values; `addMemberToTeam` too.

## Exports
- CSV/PDF are generated in the browser from already-loaded data. For very large workspaces add `GET /tasks/export?format=csv` with the same filters.
