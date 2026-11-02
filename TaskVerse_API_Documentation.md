# TaskVerse API Documentation
**Frontend integration guide · Backend: Node.js / Express / MongoDB · Hosting: separate Vercel projects**

> **Document basis:** inspected backend source archive (`api/index.js`, `src/app.controler.js`, route controllers, Joi validations, service implementations), plus the repository's `BACKEND_API_SPEC.md` and `BACKEND_HANDOFF.md`.
>
> This is an implementation-oriented integration contract. Where the source code does not define a stable request schema or where a route is not currently mounted, it is explicitly marked **Confirm with backend** instead of being presented as guaranteed behavior.

---

## 1. Deployment and base URL

Deploy the frontend and backend as **two separate Vercel projects**. They communicate over HTTPS; the frontend must never connect directly to MongoDB, Redis, Cloudinary, or SMTP.

| Setting | Value |
|---|---|
| Frontend hosting | Vercel project A |
| Backend hosting | Vercel project B |
| Backend runtime | Vercel Function, Node.js |
| Database | MongoDB Atlas |
| Redis | Upstash Redis REST |
| File storage | Cloudinary |
| Canonical API base URL | `https://<your-backend-project>.vercel.app` |
| Local backend | `http://localhost:3000` |

The repository's OpenAPI file currently lists `https://taskverse-backend.vercel.app`; verify that this is the actual deployed project domain before using it.

### API path convention

Use the route paths in this document relative to `VITE_API_BASE_URL`, for example:

```text
GET https://<backend-domain>/task
POST https://<backend-domain>/auth/signIn
```

The Express app mounts the route groups both at the root (`/task`) and under `/api` (`/api/task`). The Vercel rewrite in `vercel.json` also routes incoming paths to `api/index.js`. Use the root paths above as the frontend convention and verify the final deployed rewrite behavior once after deployment. Do not add `/api` in some calls and omit it in others.

### Frontend environment variables

Set these in **Vercel → Frontend project → Settings → Environment Variables**:

```env
VITE_API_BASE_URL=https://<your-backend-project>.vercel.app
```

For local frontend development:

```env
VITE_API_BASE_URL=http://localhost:3000
```

`VITE_` variables are public and are bundled into browser code. Never put database credentials, JWT secrets, Redis tokens, Cloudinary secrets, SMTP passwords, or cron secrets in the frontend project.

### Backend Vercel environment variables

Set these in **Vercel → Backend project → Settings → Environment Variables**:

```env
NODE_ENV=production
DB_URI=<MongoDB Atlas connection string>
JWT_SECRET=<long-random-secret>
HASH_SALT=12
ENCRYPTION_KEY_ENV=<configured-encryption-key>

UPSTASH_REDIS_REST_URL=<Upstash REST URL>
UPSTASH_REDIS_REST_TOKEN=<Upstash REST token>

FRONTEND_URL=https://<your-frontend-project>.vercel.app
CORS_ORIGINS=https://<your-frontend-project>.vercel.app,http://localhost:5173,http://localhost:5180

SMTP_USER=<SMTP username>
SMTP_PASS=<SMTP password>

CLOUD_NAME=<Cloudinary cloud name>
API_KEY_CLOUDENARY=<Cloudinary API key>
API_SECRET_CLOUDENARY=<Cloudinary API secret>

VAPID_PUBLIC_KEY=<VAPID public key>
VAPID_PRIVATE_KEY=<VAPID private key>
VAPID_MAILTO=mailto:<admin-email>

CRON_SECRET=<long-random-cron-secret>
```

Use the exact variable names expected by the backend. Do not commit real `.env` files. Configure Preview and Production values separately where appropriate.

### CORS

The backend uses `credentials: true` and an explicit comma-separated `CORS_ORIGINS` allow-list. Add the exact deployed frontend origin, with no trailing slash:

```env
CORS_ORIGINS=https://taskverse-frontend.vercel.app,http://localhost:5173
```

Do not use `*` with credentialed requests. If you use Vercel Preview deployments, add the exact preview origins you intend to allow, or use a carefully validated preview-origin strategy.

---

## 2. Request conventions

### Headers

All protected routes require:

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

For multipart uploads, let the browser set `Content-Type` and its multipart boundary; do not manually set it.

Optional concurrency/idempotency headers:

```http
Idempotency-Key: <unique-operation-key>
If-Unmodified-Since: <document-updatedAt>
Last-Event-ID: <last-received-event-id>
```

`If-Unmodified-Since` and `Idempotency-Key` are accepted by the CORS configuration. Confirm endpoint-level behavior before relying on them for every mutation.

### Standard success envelope

Most JSON endpoints use:

```json
{
  "message": "Operation completed successfully",
  "data": {}
}
```

List endpoints may return `meta`:

```json
{
  "message": "Items retrieved successfully",
  "data": [],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 25,
    "pages": 0
  }
}
```

Frontend compatibility rule: accept both a plain array in `data` and an object containing `data` plus `meta`; do not assume `meta` is always present.

### Standard error envelope

```json
{
  "message": "Human-readable English message",
  "code": "UPPER_SNAKE_CASE",
  "errors": []
}
```

`errors` is optional and is intended for validation details. Do not build UI logic around `message`; use `code`.

Common codes include:

| HTTP | Code examples | Meaning |
|---:|---|---|
| 400 | `BAD_REQUEST`, `VALIDATION_ERROR` | Malformed request |
| 401 | `INVALID_PASSWORD`, `INVALID_TOKEN`, `UNAUTHORIZED` | Authentication failure |
| 403 | `EMAIL_NOT_CONFIRMED`, `FORBIDDEN`, `VIEWER_READ_ONLY`, `ACCOUNT_DEACTIVATED` | Authenticated but not allowed / account gate |
| 404 | `USER_NOT_FOUND`, `NOT_FOUND`, `TASK_NOT_FOUND` | Resource missing |
| 409 | `MEMBER_EXISTS`, `ALREADY_EXISTS`, `CONFLICT` | Duplicate or concurrency conflict |
| 422 | `VALIDATION_ERROR` | Field validation failure |
| 429 | `RATE_LIMITED` | Rate limit exceeded |

Note: the backend's global error middleware currently falls back to HTTP 400 for errors without an explicit status. The frontend should handle unknown error codes safely.

### Date/time

Send ISO-8601 UTC timestamps where possible:

```json
{ "startDate": "2026-11-02T09:00:00.000Z" }
```

Treat dates returned by the API as UTC and format them in the user's local timezone in the UI.

### Object IDs

MongoDB identifiers are 24-character hexadecimal strings.

---

## 3. Authentication

### 3.1 Sign up (system/admin account)

`POST /auth/signUp`

Content type: `multipart/form-data` when uploading a profile picture; otherwise send form data as supported by the backend middleware.

Fields:

| Field | Type | Required |
|---|---|---:|
| `fname` | string, 2–50 | Yes |
| `lname` | string, 2–50 | Yes |
| `email` | email | Yes |
| `password` | string | Yes |
| `confirmPassword` | string, must equal password | Yes |
| `gender` | string | Yes |
| `profilePicture` | PNG/JPG, max 5 MB | No |

Password policy: at least 8 characters, including uppercase, lowercase, number, and one of `@$!%*?&`.

Expected result: account is created but not confirmed; a 6-digit OTP is emailed. The user must confirm before password sign-in.

### 3.2 Confirm sign up

`POST /auth/confirmSignUp`

```json
{ "email": "user@example.com", "otp": "123456" }
```

### 3.3 Resend OTP

`POST /auth/resendOtp`

```json
{ "email": "user@example.com" }
```

OTP attempts are limited; repeated attempts can return `429 RATE_LIMITED`.

### 3.4 Sign in

`POST /auth/signIn`

```json
{
  "email": "user@example.com",
  "password": "StrongPass1!"
}
```

Successful response:

```json
{
  "message": "login successfully",
  "data": {
    "accessToken": "<JWT>",
    "refreshToken": "<JWT>"
  }
}
```

Important responses:
- `401 INVALID_PASSWORD` — incorrect password.
- `404 USER_NOT_FOUND` — no account for this email.
- `403 EMAIL_NOT_CONFIRMED` — verify email first.
- `403 ACCOUNT_DEACTIVATED` — account disabled.

### 3.5 Google sign-in

`POST /auth/sign&signin/gmail`

```json
{ "idToken": "<Google ID token>" }
```

The backend verifies the Google ID token. Protected routes must accept both Google-provider and password-provider accounts.

### 3.6 Refresh tokens

`POST /auth/refreshToken`

Requires the current refresh token in the `Authorization` header:

```http
Authorization: Bearer <refreshToken>
```

Successful response returns a new pair:

```json
{
  "message": "Tokens refreshed successfully",
  "data": {
    "accessToken": "<new access token>",
    "refreshToken": "<new refresh token>"
  }
}
```

The backend caches the result for a short concurrency window so two tabs refreshing the same token can receive the same pair. The frontend should update both stored tokens atomically.

### 3.7 Logout

`POST /auth/logout`

Requires Bearer token. Clears/revokes the current session according to backend session logic.

### 3.8 Current profile

`GET /auth/profile` or `GET /member/profile`

Requires Bearer access token.

### 3.9 Forgot/reset password

`POST /auth/forgotPassword`

```json
{ "email": "user@example.com" }
```

`POST /auth/resetPassword`

```json
{
  "email": "user@example.com",
  "otp": "123456",
  "password": "NewStrongPass1!",
  "confirmPassword": "NewStrongPass1!"
}
```

### 3.10 Change password

`POST /auth/changePassword`

```json
{
  "oldPassword": "OldStrongPass1!",
  "newPassword": "NewStrongPass1!",
  "confirmPassword": "NewStrongPass1!"
}
```

### 3.11 Sessions

`GET /auth/sessions` — list the caller's sessions. Current session should be flagged.

`DELETE /auth/sessions/:sessionId` — revoke one session/device.

### 3.12 Change email

`PATCH /auth/changeEmail`

```json
{
  "password": "CurrentStrongPass1!",
  "newEmail": "new-address@example.com"
}
```

`POST /auth/confirmChangeEmail`

**Confirm with backend:** exact OTP request fields should be checked against the current service implementation before frontend wiring.

### 3.13 Delete account

`DELETE /auth/account`

```json
{ "password": "CurrentStrongPass1!" }
```

---

## 4. Members

All member routes below require an access token unless explicitly stated.

| Method | Path | Purpose |
|---|---|---|
| GET | `/member` | List members, including teams |
| GET | `/member/all` | Alias of list |
| GET | `/member/profile` | Current profile |
| POST | `/member/createMember` | Admin creates/invites a member |
| PATCH | `/member/:id` | Update member profile |
| DELETE | `/member/:id` | Admin deletes member |
| POST | `/member/:id/resetPassword` | Admin triggers password reset |
| PATCH | `/member/:id/active` | Admin activates/deactivates member |
| GET | `/member/preferences` | Read notification preferences |
| PATCH | `/member/preferences` | Update notification preferences |

### List members

`GET /member`

The backend specification says each member includes:

```json
{
  "_id": "memberId",
  "fname": "First",
  "lname": "Last",
  "email": "user@example.com",
  "teams": [
    { "teamId": "teamId", "name": "Core Engineering", "role": "editor" }
  ]
}
```

Never assume every optional profile field is present.

### Create member

`POST /member/createMember`

Admin only. Uses invitation flow. The exact accepted body fields should match `createMemberValidation`; use the existing frontend form fields and confirm any optional role/team fields with backend.

### Update member

`PATCH /member/:id`

Profile fields include `fname`, `lname`, `gender`, and `profilePicture`. Profile picture upload uses multipart form data (PNG/JPG, max 5 MB).

### Activate/deactivate

`PATCH /member/:id/active`

```json
{ "active": false }
```

### Preferences

`GET /member/preferences`

`PATCH /member/preferences`

The intended preference shape is:

```json
{
  "emailAssigned": true,
  "emailMention": true,
  "emailDue": true,
  "emailDigest": true,
  "push": {},
  "quietHours": null,
  "timezone": "Africa/Cairo"
}
```

**Confirm with backend:** exact nested `push` and `quiet-hours` schema before building preference controls.

---

## 5. Teams

All team endpoints require Bearer access token.

| Method | Path | Purpose |
|---|---|---|
| GET | `/team` | List teams visible to caller |
| GET | `/team/all` | Alias of list |
| POST | `/team/createTeam` | Create team (system admin) |
| GET | `/team/:id` | Team details |
| GET | `/team/:id/activity` | Team activity |
| POST | `/team/addMemberToTeam` | Add one or many members |
| POST | `/team/removeMemberFromTeam` | Remove one or many members |
| POST | `/team/updateMemberRoleInTeam` | Change a member's team role |
| POST | `/team/updateTeamName` | Rename team |
| POST | `/team/deleteTeam` | Soft-delete team |
| POST | `/team/restore` | Restore team |

### Create team

`POST /team/createTeam`

```json
{ "name": "Core Engineering" }
```

System admin only.

### Add members

`POST /team/addMemberToTeam`

Single member:

```json
{
  "teamId": "TEAM_OBJECT_ID",
  "memberId": "MEMBER_OBJECT_ID",
  "role": "editor"
}
```

Bulk:

```json
{
  "teamId": "TEAM_OBJECT_ID",
  "memberIds": ["MEMBER_ID_1", "MEMBER_ID_2"],
  "role": "editor"
}
```

An email-based `member_email` is also accepted by validation. Supported role inputs include `admin`, `editor`, `viewer`, legacy `member`, and aliases `teamAdmin`, `teamMember`, `teamViewer`. Prefer canonical values `admin | editor | viewer`.

### Remove members

`POST /team/removeMemberFromTeam`

```json
{
  "teamId": "TEAM_OBJECT_ID",
  "memberIds": ["MEMBER_ID_1", "MEMBER_ID_2"]
}
```

Use `memberId` for a single member.

### Update member role

`POST /team/updateMemberRoleInTeam`

```json
{
  "teamId": "TEAM_OBJECT_ID",
  "memberId": "MEMBER_OBJECT_ID",
  "role": "viewer"
}
```

### Rename team

`POST /team/updateTeamName`

```json
{ "teamId": "TEAM_OBJECT_ID", "name": "Platform Team" }
```

### Delete / restore team

`POST /team/deleteTeam`

```json
{ "teamId": "TEAM_OBJECT_ID" }
```

`POST /team/restore`

```json
{ "teamId": "TEAM_OBJECT_ID" }
```

### Team response compatibility

The backend keeps the legacy `teamAdims` field and also exposes `teamAdmins`. Frontend code should prefer `teamAdmins` but tolerate `teamAdims` during migration. Team details expose member roles and task counts according to the backend handoff.

---

## 6. Tasks

### Task fields

| Field | Type / allowed values |
|---|---|
| `title` | string, required, 2–150 chars |
| `description` | string, max 20,000 chars |
| `startDate`, `endDate` | ISO date or `null` |
| `team` / `teamId` | team ObjectId or `null` |
| `createdBy` | set by server; never send from frontend |
| `priority` | `"" | low | medium | high | urgent` |
| `tags` | string array, max 10; each max 24 chars |
| `recurrence` | `none | daily | weekly | monthly` |
| `remindBefore` | integer 0–30 days |
| `estimateMin` | integer >= 0 |
| `archived` | boolean |
| `subtasks` | max 100; strings or `{ text, done }` on create |
| `assignees` | array of Member ObjectIds on create |

### Task routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/task` | List/filter tasks |
| GET | `/task/all` | Alias of list |
| POST | `/task/createTask` | Create task and initial assignments |
| GET | `/task/:taskId` | Task details |
| PATCH | `/task/:taskId` | Update task |
| DELETE | `/task/:taskId` | Soft-delete task |
| POST | `/task/:taskId/restore` | Restore task |
| POST | `/task/bulkDelete` | Soft-delete multiple tasks |
| POST | `/task/bulkRestore` | Restore multiple tasks |
| POST | `/task/:taskId/share` | Create read-only share link |
| DELETE | `/task/:taskId/share` | Revoke share link |
| POST | `/task/:taskId/complete-and-spawn` | Complete and spawn recurrence |

### Create task

`POST /task/createTask`

```json
{
  "title": "Implement authentication",
  "description": "Build sign-in and refresh-token flow",
  "startDate": "2026-11-02T09:00:00.000Z",
  "endDate": "2026-11-06T17:00:00.000Z",
  "team": "TEAM_OBJECT_ID",
  "priority": "high",
  "tags": ["backend", "auth"],
  "recurrence": "none",
  "remindBefore": 1,
  "estimateMin": 480,
  "subtasks": [
    "Implement sign in",
    { "text": "Implement refresh token", "done": false }
  ],
  "assignees": ["MEMBER_ID_1", "MEMBER_ID_2"]
}
```

`teamId` is also accepted as an alias for `team`. `createdBy` is derived from the authenticated user. Initial assignments are created as part of the same API operation.

### List tasks and filters

`GET /task`

Supported query parameters:

| Query | Example | Meaning |
|---|---|---|
| `team` | `?team=<id>` | Filter by team |
| `assignee` | `?assignee=<memberId>` | Filter by assigned member |
| `status` | `?status=inProgress` | Filter by derived task status |
| `priority` | `?priority=high` | Filter by priority |
| `tag` | `?tag=backend` | Filter by tag |
| `archived` | `?archived=true` | Archived tasks; default is false |
| `due` | `?due=overdue` | `overdue`, `today`, or `week` |
| `q` | `?q=authentication` | Text search |
| `page` | `?page=1` | Page number |
| `limit` | `?limit=25` | Page size |
| `sort` | `?sort=createdAt` | Sort field |
| `order` | `?order=desc` | `asc` or `desc` |

Example:

```http
GET /task?team=TEAM_ID&priority=high&due=week&page=1&limit=25&sort=endDate&order=asc
```

Task list objects include populated team/creator/assignee data and derived counts/status where available. The derived task status uses assignments:
- all assignments completed → `completed`
- at least one failed → `failed` (display as Blocked)
- at least one in progress → `inProgress`
- otherwise → `toDo`

### Update task

`PATCH /task/:taskId`

Send only changed writable fields:

```json
{
  "title": "Implement authentication and sessions",
  "priority": "urgent",
  "estimateMin": 600,
  "archived": false
}
```

Writable fields: `title`, `description`, `startDate`, `endDate`, `team`/`teamId`, `priority`, `tags`, `recurrence`, `remindBefore`, `estimateMin`, `archived`.

### Delete / restore

`DELETE /task/:taskId` — soft delete.

`POST /task/:taskId/restore` — restore within the retention window.

Bulk delete/restore:

```json
{ "ids": ["TASK_ID_1", "TASK_ID_2"] }
```

Maximum 200 IDs per request. The API returns per-ID success/skipped information according to service behavior.

### Share link

`POST /task/:taskId/share` — creates a public read-only share token.

`DELETE /task/:taskId/share` — revokes it.

`GET /public/task/:token` — public endpoint; no Authorization header. Only limited task information should be exposed; never expose member emails or private account data.

---

## 7. Task assignments

| Method | Path | Purpose |
|---|---|---|
| GET | `/taskAssignment` | List assignments visible to caller |
| GET | `/taskAssignment/all` | Alias of list |
| GET | `/taskAssignment/mine` | Caller's assignments |
| POST | `/taskAssignment/addMemberToTask` | Add one/many assignees |
| POST | `/taskAssignment/removeMemberFromTask` | Remove one/many assignees |
| PATCH | `/taskAssignment/taskStatusByMember` | Change assignment status |
| POST | `/taskAssignment/bulkStatus` | Change status for multiple tasks |

### Add assignees

`POST /taskAssignment/addMemberToTask`

```json
{ "taskId": "TASK_ID", "memberId": "MEMBER_ID" }
```

or:

```json
{ "taskId": "TASK_ID", "memberIds": ["MEMBER_ID_1", "MEMBER_ID_2"] }
```

For team tasks, assignees must belong to that team. Duplicate single assignment should be treated as a conflict.

### Remove assignees

`POST /taskAssignment/removeMemberFromTask`

Accepts `memberId` or `memberIds` together with `taskId`.

### Update own status

`PATCH /taskAssignment/taskStatusByMember`

```json
{ "taskId": "TASK_ID", "status": "inProgress" }
```

Canonical status values:

```text
toDo | inProgress | completed | failed
```

Legacy values `complete` and `fail` are accepted and normalized to `completed` and `failed`.

A task assignee changes their own assignment. A task manager may pass `memberId` to act on behalf of a member, subject to permission checks.

### Bulk status

`POST /taskAssignment/bulkStatus`

```json
{
  "taskIds": ["TASK_ID_1", "TASK_ID_2"],
  "status": "completed"
}
```

---

## 8. Subtasks, comments, attachments, and time

### Subtasks

| Method | Path | Body |
|---|---|---|
| POST | `/task/:taskId/subtasks` | `{ "text": "Write tests" }` |
| PATCH | `/task/:taskId/subtasks/:subId` | `{ "text": "Updated text" }` and/or `{ "done": true }` |
| DELETE | `/task/:taskId/subtasks/:subId` | No body |

### Comments

| Method | Path | Body |
|---|---|---|
| GET | `/task/:taskId/comments` | Query pagination if supported |
| POST | `/task/:taskId/comments` | `{ "text": "Please review this @FirstLast" }` |
| PATCH | `/task/:taskId/comments/:commentId` | `{ "text": "Updated comment" }` |
| DELETE | `/task/:taskId/comments/:commentId` | No body |

Comments are 1–2,000 characters. The intended mention syntax is `@FirstLast`. The backend resolves eligible members with access to the task and may create notifications. Comment edit window and exact mention matching should be confirmed against service behavior.

### Attachments

| Method | Path | Body |
|---|---|---|
| GET | `/task/:taskId/attachments` | No body |
| POST | `/task/:taskId/attachments` | `multipart/form-data`, field name `file` |
| DELETE | `/task/:taskId/attachments/:attId` | No body |

The backend upload middleware uses Cloudinary. The task handoff describes a 10 MB/file limit and 20 files/task; confirm the currently configured multer limits before relying on these exact limits. Vercel Functions also impose request/response payload constraints, so large files should be uploaded directly to object storage using signed upload flows rather than being proxied through a Function.

### Time entries

| Method | Path | Body |
|---|---|---|
| GET | `/task/:taskId/time` | No body |
| POST | `/task/:taskId/time` | `{ "minutes": 90, "note": "API implementation", "at": "2026-11-02T12:00:00.000Z" }` |
| DELETE | `/task/:taskId/time/:entryId` | No body |

`minutes` must be an integer from 1 to 1,440. `note` is optional and max 140 characters. The frontend owns the running timer; post one time entry when the timer stops.

---

## 9. Dashboard, activity, search, sync, export

### Dashboard

| Method | Path | Query |
|---|---|---|
| GET | `/dashboard` | `?team=<teamId\|all>` |
| GET | `/dashboard/time` | `?from=<ISO>&to=<ISO>&team=<teamId>` |

Dashboard summary is scoped to what the caller can access. The expected summary includes totals, by-status, by-team, by-member, logged/estimated time, and burndown information. Confirm exact response fields with the current dashboard service before hardcoding chart property names.

### Activity

`GET /activity` — authenticated activity feed. Team activity is also available at `GET /team/:id/activity`.

**Confirm with backend:** supported query filters and exact activity response fields.

### Search

`GET /search?q=<query>&types=task,team,member&limit=20`

Search results are access-scoped. Confirm exact grouped result shape before mapping it into UI components.

### Delta sync

`GET /changes?since=2026-11-02T10:00:00.000Z`

Expected response shape:

```json
{
  "message": "Changes retrieved",
  "data": {
    "now": "2026-11-02T10:05:00.000Z",
    "tasks": { "upserted": [], "deleted": [] },
    "teams": { "upserted": [], "deleted": [] },
    "members": { "upserted": [], "deleted": [] },
    "assignments": { "upserted": [], "deleted": [] }
  }
}
```

Use the returned `now` value as the next `since` cursor. Do not use the browser's clock as the cursor. The exact shape should be verified against the live service.

### Export

- `GET /export/tasks.csv` — CSV download; accepts the same task filters where implemented.
- `GET /export/report.pdf?team=<teamId>` — PDF report.

For CSV, read the response as a Blob and use the `Content-Disposition` filename when provided.

---

## 10. Notifications and push

| Method | Path | Purpose |
|---|---|---|
| GET | `/notifications` | List notifications |
| POST | `/notifications/read` | Mark notifications read |
| DELETE | `/notifications/:id` | Delete notification |
| GET | `/push/key` | Get public VAPID key |
| POST | `/push/subscribe` | Save browser push subscription |
| DELETE | `/push/subscribe` | Remove browser push subscription |

### List notifications

`GET /notifications?unread=true&page=1&limit=25`

The handoff specifies `meta.unread` as the unread count; confirm current live response.

### Mark read

`POST /notifications/read`

Expected request:

```json
{ "ids": ["NOTIFICATION_ID_1", "NOTIFICATION_ID_2"] }
```

or:

```json
{ "all": true }
```

### Push subscription

`GET /push/key` is public and returns the VAPID public key.

`POST /push/subscribe` — authenticated:

```json
{
  "endpoint": "https://push-service.example/...",
  "keys": {
    "p256dh": "<key>",
    "auth": "<key>"
  }
}
```

`DELETE /push/subscribe` — authenticated; confirm whether the backend expects the endpoint in the body.

---

## 11. Realtime and Vercel-specific behavior

### Current backend route

`GET /events`

The backend implements Server-Sent Events (SSE), accepts `Authorization: Bearer <accessToken>` and supports `Last-Event-ID` replay according to the event service.

Example event payload:

```json
{
  "id": "event-id",
  "type": "task.updated",
  "actorId": "MEMBER_ID",
  "taskId": "TASK_ID",
  "teamId": "TEAM_ID",
  "at": "2026-11-02T10:00:00.000Z"
}
```

### Important deployment note

Vercel Functions support HTTP streaming/SSE on the Node.js runtime, so SSE is not categorically impossible on Vercel. However, this repository currently sets:

```json
{
  "functions": {
    "api/index.js": { "maxDuration": 30 }
  }
}
```

Therefore, an SSE request can be terminated when that function invocation reaches its configured duration. The current event replay implementation must also use a shared durable store (for example Redis) if events need to be replayed across different serverless instances; in-memory buffers are not reliable across instances or deployments.

**Recommended frontend behavior for the current Vercel deployment:**
1. Use `GET /changes?since=<last-server-cursor>` as the reliable sync mechanism.
2. Poll on a modest interval (for example 20–30 seconds while the app is active).
3. Pause or slow polling when the tab is hidden.
4. On reconnect/focus, fetch changes and then refresh the affected views.
5. Treat SSE as an optional low-latency enhancement, not the only source of truth.

If the backend team raises function duration and confirms shared event replay storage, the frontend can use SSE with reconnect/backoff. Do not keep an unbounded EventSource/fetch stream without reconnect handling.

### EventSource authentication

Native browser `EventSource` cannot set an Authorization header. The backend accepts an `access_token` query parameter for EventSource compatibility only if implemented in its auth middleware. Prefer `fetch()` streaming with an Authorization header; avoid putting long-lived tokens in URLs because URLs can be logged. Confirm that query-token support is enabled before using it.

---

## 12. Cron endpoints

These routes are intended for Vercel Cron or another trusted scheduler:

| Method | Path | Purpose |
|---|---|---|
| POST | `/cron/reminders` | Run reminder processing |
| POST | `/cron/purge` | Purge expired soft-deleted records / data |

When `CRON_SECRET` is configured, send:

```http
Authorization: Bearer <CRON_SECRET>
```

Configure schedules in the **backend** Vercel project's `vercel.json`, not in the frontend project. Protect these endpoints with a secret and make jobs idempotent. The current repository's `vercel.json` does not declare cron schedules; the endpoints exist, but schedules still need to be configured.

---

## 13. Permissions

The server is the source of truth. Hiding buttons in the frontend is not authorization.

| Action | System admin | Team manager/admin | Editor | Viewer | Assignee |
|---|---:|---:|---:|---:|---:|
| Read accessible task | Yes | Yes | Yes | Yes | Yes |
| Create task in team | Yes | Yes | Yes | No | No |
| Edit/delete/archive task | Yes | Yes | No | No | No |
| Assign/remove members | Yes | Yes | No | No | No |
| Change own assignment status | Yes* | Yes* | Yes* | No | Yes |
| Comment/subtask/attachment/time | Yes | Yes | Yes | No | Yes |

`*` Subject to assignment and manager rules. The exact authorization service takes precedence.

For a Viewer mutation, the expected response is:

```http
403 Forbidden
```

```json
{
  "message": "Viewers have read-only access",
  "code": "VIEWER_READ_ONLY"
}
```

A user's role is team-specific. Being an editor in Team A does not grant editor permissions in Team B.

---

## 14. Frontend integration example

A small fetch wrapper:

```js
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function apiRequest(path, {
  method = "GET",
  token,
  body,
  headers = {},
} = {}) {
  const isFormData = body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(!isFormData && body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...headers,
    },
    body: body === undefined
      ? undefined
      : isFormData
        ? body
        : JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.blob();

  if (!response.ok) {
    const error = new Error(payload?.message || "Request failed");
    error.status = response.status;
    error.code = payload?.code || "UNKNOWN_ERROR";
    error.details = payload?.errors;
    throw error;
  }

  return payload;
}
```

Example usage:

```js
const result = await apiRequest("/task", {
  token: accessToken,
});

const tasks = Array.isArray(result.data)
  ? result.data
  : result.data?.items ?? [];
```

Do not use the same generic JSON helper for CSV/PDF downloads unless it handles Blob responses as shown above.

### Token handling recommendations

- Keep access tokens in memory where practical.
- If refresh tokens are persisted, protect them from XSS; avoid localStorage when the architecture can use secure HttpOnly cookies.
- Refresh once on an eligible `401`, then retry the original request once.
- Do not refresh on `403`, `404`, `409`, `422`, or `429`.
- Prevent refresh loops.
- Update the access and refresh token pair together.
- Clear local auth state on unrecoverable refresh failure or explicit logout.

---

## 15. Endpoint inventory and implementation status

The following route groups are present in the inspected Express app:

- `/auth`
- `/member`
- `/team`
- `/task`
- `/taskAssignment`
- `/activity`
- `/dashboard`
- `/templates`
- `/notifications`
- `/push`
- `/search`
- `/changes`
- `/export`
- `/events`
- `/cron`
- `/public`

Some routes listed in the original frontend handoff are not currently visible in the inspected controllers, including a dedicated `GET /taskAssignment` filter contract beyond its list endpoint, certain notification preference/push details, and some optional export/search response details. The endpoint tables above distinguish mounted routes from behavior that still needs confirmation.

### Backend team: final contract checks before frontend sign-off

1. Confirm the exact deployed backend domain and root-vs-`/api` path behavior after Vercel rewrite.
2. Confirm exact schemas for `confirmChangeEmail`, member invitation, preferences, notifications/read, push unsubscribe, dashboard, search, and activity filters.
3. Confirm whether SSE replay uses Redis/shared storage rather than per-instance memory.
4. Add Vercel Cron schedules for `/cron/reminders` and `/cron/purge` if those jobs are required in production.
5. Confirm upload size limits and whether uploads should move to direct-to-Cloudinary signed uploads to avoid Vercel Function payload limits.
6. Publish an OpenAPI file generated from the final deployed implementation and keep it updated with every route change.

---

## 16. Quick integration checklist

- [ ] Frontend `VITE_API_BASE_URL` points to the backend Vercel project.
- [ ] Backend `FRONTEND_URL` points to the frontend Vercel project.
- [ ] Backend `CORS_ORIGINS` includes the exact frontend production origin.
- [ ] All protected requests send `Authorization: Bearer <accessToken>`.
- [ ] Sign-up flow confirms email before password sign-in.
- [ ] Refresh updates both tokens and handles concurrent tabs.
- [ ] UI uses error `code`, not English `message`, for translations.
- [ ] Viewer read-only restrictions are handled from `403 VIEWER_READ_ONLY`.
- [ ] List pages tolerate responses with or without `meta`.
- [ ] Uploads use `FormData` and do not manually set multipart Content-Type.
- [ ] CSV/PDF exports are handled as Blob downloads.
- [ ] `/changes` polling is implemented as the Vercel-safe sync fallback.
- [ ] Cron endpoints are protected and scheduled in the backend project.
- [ ] No backend secrets are present in frontend environment variables.
