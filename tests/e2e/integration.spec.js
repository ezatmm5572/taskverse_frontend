import { test, expect } from '@playwright/test'

// Runs against tests/mock-backend/server.mjs, which implements TaskVerse_API_Documentation.md.
// To run against a real staging backend point VITE_API_BASE_URL at it and drop the mock-only /__log, /__otp helpers.
const API = 'http://localhost:3911'
const EMAIL = 'jane.doe@example.com'
const PASSWORD = 'Passw0rd!'

test.describe.configure({ mode: 'serial' })

let page, accessToken, ctx
const call = async (path, method = 'GET', body, token = accessToken) => {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, ...(await r.json()) }
}
const nav = name => page.locator('.nav-item-btn', { hasText: name }).click()
const log = async () => (await fetch(API + '/__log')).json()
const count = async route => (await log()).filter(l => l === route).length
const reloadApp = async () => { await page.reload(); await page.locator('.sidebar').waitFor() }
const signIn = async (p, email) => {
  await p.goto('/app')
  await p.locator('input[type=email]').fill(email)
  await p.locator('input[type=password]').fill(PASSWORD)
  await p.getByRole('button', { name: /Sign in to Workspace/ }).click()
}
const apiLogin = async email => (await call('/auth/signIn', 'POST', { email, password: PASSWORD }, null)).data.accessToken

test.beforeAll(async ({ browser }) => {
  await fetch(API + '/__reset', { method: 'POST' })
  ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
  page = await ctx.newPage()
  page.on('dialog', d => d.accept())
  await page.goto('/app')
  await page.evaluate(() => localStorage.clear())
})
test.afterAll(async () => ctx.close())

test('sign up -> OTP -> sign in (documented auth flow)', async () => {
  await page.goto('/app')
  await page.getByRole('button', { name: 'Create a new admin account' }).click()
  await page.getByPlaceholder('Alex', { exact: true }).fill('Jane')
  await page.getByPlaceholder('Vance').fill('Doe')
  await page.locator('input[type=email]').fill(EMAIL)
  await page.getByPlaceholder('Upper, lower, number, @$!%*?&').fill(PASSWORD)
  await page.getByPlaceholder('Repeat password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByText('6-digit Code')).toBeVisible()
  await page.getByPlaceholder('123456').fill('000000')
  await page.getByRole('button', { name: 'Verify and Continue' }).click()
  await expect(page.locator('.toast, .notice, [role=status]').filter({ hasText: 'Invalid Otp' }).first()).toBeVisible()

  await page.getByPlaceholder('123456').fill('123456')
  await page.getByRole('button', { name: 'Verify and Continue' }).click()
  await expect(page.getByRole('button', { name: /Sign in to Workspace/ })).toBeVisible()
  await page.locator('input[type=email]').fill(EMAIL)
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.getByRole('button', { name: /Sign in to Workspace/ }).click()
  await page.locator('.sidebar').waitFor()
  await expect(page.getByText('Jane').first()).toBeVisible()
  accessToken = await page.evaluate(() => localStorage.getItem('taskverse-token'))
  expect(accessToken).toMatch(/^access\./)
})

test('error codes: wrong password, unknown user, unconfirmed email -> OTP screen', async ({ browser }) => {
  const p = await (await browser.newContext()).newPage()
  await p.goto('/app'); await p.locator('input[type=email]').fill(EMAIL); await p.locator('input[type=password]').fill('Wrong123!'); await p.getByRole('button', { name: /Sign in to Workspace/ }).click()
  await expect(p.getByText('Incorrect password.').first()).toBeVisible()
  await p.locator('input[type=email]').fill('nobody@example.com'); await p.getByRole('button', { name: /Sign in to Workspace/ }).click()
  await expect(p.getByText('No account found for this email.').first()).toBeVisible()

  await call('/auth/signUp', 'POST', { fname: 'Late', lname: 'User', email: 'late@example.com', password: PASSWORD, confirmPassword: PASSWORD, gender: 'male' }, null)
  await p.locator('input[type=email]').fill('late@example.com'); await p.locator('input[type=password]').fill(PASSWORD)
  await p.getByRole('button', { name: /Sign in to Workspace/ }).click()
  await expect(p.getByText('6-digit Code')).toBeVisible() // EMAIL_NOT_CONFIRMED sends the user straight to verification
  await p.close()
})

test('expired access token is refreshed transparently', async () => {
  await page.evaluate(() => localStorage.setItem('taskverse-token', 'junk.expired.token'))
  await page.reload()
  await page.locator('.sidebar').waitFor()
  await expect.poll(() => count('POST /auth/refreshToken')).toBeGreaterThan(0)
  const fresh = await page.evaluate(() => localStorage.getItem('taskverse-token'))
  expect(fresh).toMatch(/^access\./)
  accessToken = fresh
})

test('admin creates members; they appear in Members with their teams', async () => {
  for (let i = 1; i <= 6; i++) {
    const r = await call('/member/createMember', 'POST', { fname: `Member${i}`, lname: 'Test', email: `m${i}@example.com`, password: PASSWORD, confirmPassword: PASSWORD, gender: i % 2 ? 'male' : 'female' })
    expect(r.status).toBe(201)
  }
  const dup = await call('/member/createMember', 'POST', { fname: 'Dup', lname: 'Test', email: 'm1@example.com', password: PASSWORD, confirmPassword: PASSWORD, gender: 'male' })
  expect(dup.status).toBe(409)
  expect(dup.code).toBe('MEMBER_EXISTS')
  await reloadApp()
  await nav('Members')
  await expect(page.getByText('Member6 Test').first()).toBeVisible()
})

test('team: bulk add = ONE request, role change (incl. Viewer), rename, bulk remove', async () => {
  expect((await call('/team/createTeam', 'POST', { name: 'Design' })).status).toBe(201)
  await reloadApp()
  await nav('Teams')
  await page.locator('.entity-card', { hasText: 'Design' }).click()
  await page.locator('.team-members-list').waitFor()

  const before = await count('POST /team/addMemberToTeam')
  await page.locator('.picker-all').click()
  await page.getByRole('button', { name: /Add \d+ selected/ }).click()
  await expect.poll(async () => (await call('/team')).data[0].teamMembers.length).toBe(8) // creator + 6 members + the unconfirmed 'late' account
  expect(await count('POST /team/addMemberToTeam') - before).toBe(1)

  await page.locator('.team-member-row', { hasText: 'Member2' }).locator('select').selectOption('teamAdmin')
  await expect.poll(async () => (await call('/team')).data[0].teamAdmins.length).toBe(2)

  // Viewer is a real server role now
  await page.locator('.team-member-row', { hasText: 'Member6' }).locator('select').selectOption('teamViewer')
  await expect.poll(async () => (await call('/member')).data.find(m => m.email === 'm6@example.com').teams[0].role).toBe('viewer')

  const nameInput = page.locator('.td-add-row input').first()
  await nameInput.fill('Design Systems'); await nameInput.blur()
  await expect.poll(async () => (await call('/team')).data[0].name).toBe('Design Systems')

  const rm = await count('POST /team/removeMemberFromTeam')
  for (const n of ['Member3', 'Member4', 'Member5']) await page.locator('.team-member-row', { hasText: n }).locator('input[type=checkbox]').check()
  await page.getByRole('button', { name: /Remove 3 selected/ }).click()
  await expect.poll(async () => (await call('/team')).data[0].teamMembers.length).toBe(5)
  expect(await count('POST /team/removeMemberFromTeam') - rm).toBe(1)
})

test('create task with template fields + assignees in ONE request', async () => {
  await page.keyboard.press('Escape')
  await nav('Tasks')
  const before = await count('POST /task/createTask')
  await page.getByRole('button', { name: 'New Task' }).click()
  await page.locator('.tpl-chip button', { hasText: 'Weekly report' }).click()
  await page.getByRole('button', { name: /Create Task/ }).last().click()
  await expect(page.locator('.task-table tbody tr', { hasText: 'Weekly status report' })).toBeVisible()
  expect(await count('POST /task/createTask') - before).toBe(1)
  const t = (await call('/task')).data.find(x => x.title === 'Weekly status report')
  expect(t.recurrence).toBe('weekly')
  expect(t.priority).toBe('medium')
  expect(t.subtasks.length).toBe(4)
  expect(t.tags).toContain('report')
})

test('task card writes through: priority, tag, subtask, comment, time, estimate', async () => {
  const jane = (await call('/member/profile')).data
  const t = (await call('/task')).data.find(x => x.title === 'Weekly status report')
  expect((await call('/taskAssignment/addMemberToTask', 'POST', { taskId: t._id, memberIds: [jane._id] })).data.added).toHaveLength(1)
  await reloadApp(); await nav('Tasks')
  await page.locator('.task-table tbody tr', { hasText: 'Weekly status report' }).locator('.task-open').click()
  await page.locator('.task-detail').waitFor()

  await page.locator('.td-status-opt.prio.urgent').click()
  await page.locator('input[list="tag-suggestions"]').fill('backend'); await page.keyboard.press('Enter')
  await page.locator('input[placeholder*="subtask"]').fill('Server subtask'); await page.keyboard.press('Enter')
  const box = page.locator('.mi input')
  await box.click(); await box.pressSequentially('Hello there, please look'); await page.keyboard.press('Enter')
  await page.locator('input[placeholder^="Log time"]').fill('1h30m'); await page.keyboard.press('Enter')

  await expect.poll(async () => { const d = (await call(`/task/${t._id}`)).data; return [d.priority, d.tags.includes('backend'), d.subtasks.some(s => s.text === 'Server subtask'), d.comments.length, d.timeEntries[0]?.minutes].join('|') }).toBe('urgent|true|true|1|90')
  // a subtask toggle is persisted too
  await page.locator('.att-row', { hasText: 'Server subtask' }).locator('input[type=checkbox]').check()
  await expect.poll(async () => (await call(`/task/${t._id}`)).data.subtasks.find(s => s.text === 'Server subtask').done).toBe(true)
  // attachment is uploaded to the server (multipart), and its url is used for download
  await page.locator('input[type=file]').setInputFiles({ name: 'spec.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(page.locator('.att-row', { hasText: 'spec.txt' })).toBeVisible()
  expect((await call(`/task/${t._id}`)).data.attachments.some(a => a.name === 'spec.txt')).toBe(true)
  await page.locator('.modal-backdrop').first().click({ position: { x: 5, y: 5 } })
})

test('"To do" is a real status and recurring completion uses complete-and-spawn', async () => {
  await reloadApp(); await nav('Tasks')
  const row = page.locator('.task-table tbody tr', { hasText: 'Weekly status report' })
  const before = (await call('/task')).data.length
  await row.locator('.task-check-btn').click() // inProgress -> ... -> complete (toggle)
  await row.locator('.task-check-btn').click()
  await expect.poll(async () => (await log()).some(l => l.endsWith('/complete-and-spawn'))).toBe(true)
  await expect.poll(async () => (await call('/task')).data.length).toBe(before + 1)
})

test('viewer: server returns 403 VIEWER_READ_ONLY and the UI shows read-only', async ({ browser }) => {
  const team = (await call('/team')).data[0]
  const m6 = (await call('/member')).data.find(m => m.email === 'm6@example.com')
  const t = (await call('/task')).data.find(x => x.title === 'Weekly status report' && x.team)
  await call('/taskAssignment/addMemberToTask', 'POST', { taskId: t._id, memberIds: [m6._id] })
  const vt = await apiLogin('m6@example.com')
  for (const [path, method, body] of [[`/task/${t._id}/comments`, 'POST', { text: 'hi' }], [`/task/${t._id}/time`, 'POST', { minutes: 5 }], [`/task/${t._id}/subtasks`, 'POST', { text: 'x' }], ['/taskAssignment/taskStatusByMember', 'PATCH', { taskId: t._id, status: 'completed' }]]) {
    const r = await call(path, method, body, vt)
    expect([r.status, r.code]).toEqual([403, 'VIEWER_READ_ONLY'])
  }
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
  await signIn(p, 'm6@example.com')
  await p.locator('.sidebar').waitFor()
  await p.locator('.nav-item-btn', { hasText: 'Tasks' }).click()
  await p.locator('.task-table tbody tr', { hasText: 'Weekly status report' }).first().locator('.task-open').click()
  await expect(p.locator('.viewer-banner')).toBeVisible()
  await p.close()
  expect(team.name).toBeTruthy()
})

test('delete is immediate, Undo restores it from the server', async () => {
  await reloadApp(); await nav('Tasks')
  const rows = page.locator('.task-table tbody tr:not(:has(.empty-state))')
  const n = await rows.count()
  await rows.first().locator('.danger-btn').click()
  await expect(rows).toHaveCount(n - 1)
  await expect.poll(async () => (await log()).some(l => l.startsWith('DELETE /task/'))).toBe(true)
  await page.locator('.undo-btn').click()
  await expect(rows).toHaveCount(n)
  await expect.poll(async () => (await log()).some(l => l.endsWith('/restore'))).toBe(true)
})

test('server notifications fill the bell and mark-read is saved', async () => {
  await reloadApp()
  await page.locator('.notif-wrap > .icon-btn, button[title="Notifications"]').first().click()
  await expect(page.locator('.notif-panel')).toContainText('You were assigned')
  await page.getByRole('button', { name: /Mark all read/ }).click()
  await expect.poll(() => count('POST /notifications/read')).toBeGreaterThan(0)
  await expect.poll(async () => (await call('/notifications')).meta.unread).toBe(0)
})

test('/changes polling shows a task created elsewhere without reload', async () => {
  test.setTimeout(75_000)
  const team = (await call('/team')).data[0]
  await call('/task/createTask', 'POST', { title: 'Created by someone else', team: team._id, startDate: '2026-11-01', endDate: '2026-11-20' })
  await nav('Tasks')
  await expect(page.locator('.task-table tbody tr', { hasText: 'Created by someone else' })).toBeVisible({ timeout: 40_000 })
  expect(await count('GET /changes')).toBeGreaterThan(0)
})

test('member card role picker: Viewer / Member / Admin', async () => {
  const roleOf = async () => { const m = (await call('/member')).data.find(x => x.email === 'm2@example.com'); return [m.role, m.teams[0]?.role].join('/') }
  await reloadApp(); await nav('Members')
  await page.locator('.member-row-click', { hasText: 'Member2 Test' }).first().click()
  const pick = name => page.locator('.role-picker').getByRole('radio', { name })
  await pick('Viewer (read-only)').click()
  await expect.poll(roleOf).toBe('member/viewer')
  await expect(pick('Viewer (read-only)')).toHaveAttribute('aria-checked', 'true')
  await pick('Member').click()
  await expect.poll(roleOf).toBe('member/editor')
  await pick('Admin').click() // asks for confirmation (dialog is auto-accepted)
  await expect.poll(roleOf).toBe('admin/editor')
  await expect(pick('Admin')).toHaveAttribute('aria-checked', 'true')
  await pick('Member').click()
  await expect.poll(roleOf).toBe('member/editor')
  // per-team override from the same card
  await page.locator('.team-role-row select').first().selectOption('teamViewer')
  await expect.poll(roleOf).toBe('member/viewer')
  await page.locator('.team-role-row select').first().selectOption('teamMember')
  await page.keyboard.press('Escape')
})

test('access control: master switch, per-person block, role presets, enforced by the server', async ({ browser }) => {
  await reloadApp()
  await page.locator('.nav-item-btn', { hasText: 'Access control' }).click()
  const sw = page.getByRole('switch')
  await sw.click()
  await expect.poll(async () => (await call('/access/config')).data.enabled).toBe(true)

  await page.locator('.ac-row', { hasText: 'Member5 Test' }).click()
  await page.locator('.ac-perm', { hasText: 'Create tasks' }).getByRole('radio', { name: 'Block' }).click()
  await expect.poll(async () => (await call('/access/users')).data.find(u => u.deny?.includes('task.create'))?.memberId).toBeTruthy()

  // the server enforces it...
  const t5 = await apiLogin('m5@example.com')
  const denied = await call('/task/createTask', 'POST', { title: 'Should be denied' }, t5)
  expect([denied.status, denied.code, denied.permission]).toEqual([403, 'PERMISSION_DENIED', 'task.create'])
  expect((await call('/access/me', 'GET', null, t5)).data.permissions).not.toContain('task.create')
  // ...and the UI hides what that person may not do
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
  await signIn(p, 'm5@example.com'); await p.locator('.sidebar').waitFor()
  await expect(p.getByRole('button', { name: 'Create Task' })).toHaveCount(0)
  await expect(p.locator('.nav-item-btn', { hasText: 'Access control' })).toHaveCount(0)

  // role preset: Member loses "Export data"
  await page.getByRole('tab', { name: 'Role permissions' }).click()
  await page.getByLabel('Member: Export data').uncheck()
  await expect.poll(async () => (await call('/access/me', 'GET', null, t5)).data.permissions.includes('report.export')).toBe(false)

  // only admins may touch the configuration
  expect((await call('/access/config', 'PUT', { enabled: false }, t5)).status).toBe(403)

  // switching it off lifts every restriction at once
  await sw.click()
  await expect.poll(async () => (await call('/access/config')).data.enabled).toBe(false)
  expect((await call('/task/createTask', 'POST', { title: 'Allowed again' }, t5)).status).toBe(201)
  await p.close()
})

test('member admin: rename, deactivate (sign-in blocked), delete', async () => {
  await reloadApp(); await nav('Members')
  await page.locator('.member-row-click', { hasText: 'Member1 Test' }).first().click()
  const edit = page.locator('.task-detail input[placeholder="First name"]')
  await edit.fill('Renamed'); await page.getByRole('button', { name: /Save changes/ }).click()
  await expect.poll(async () => (await call('/member')).data.find(m => m.email === 'm1@example.com').fname).toBe('Renamed')

  await page.getByRole('button', { name: 'Deactivate' }).click()
  await expect.poll(async () => (await call('/member')).data.find(m => m.email === 'm1@example.com').active).toBe(false)
  const blocked = await call('/auth/signIn', 'POST', { email: 'm1@example.com', password: PASSWORD }, null)
  expect([blocked.status, blocked.code]).toEqual([403, 'ACCOUNT_DEACTIVATED'])
  await page.getByRole('button', { name: 'Activate' }).click()
  await expect.poll(async () => (await call('/member')).data.find(m => m.email === 'm1@example.com').active).toBe(true)

  await page.getByRole('button', { name: /Delete member/ }).click()
  await expect.poll(async () => (await call('/member')).data.some(m => m.email === 'm1@example.com')).toBe(false)
})

test('profile: devices list with sign-out, and notification preferences', async ({ browser }) => {
  const other = await (await browser.newContext()).newPage()
  await signIn(other, EMAIL); await other.locator('.sidebar').waitFor(); await other.close() // a second device
  await reloadApp(); await page.locator('.nav-item-btn', { hasText: 'Profile' }).click()
  await expect(page.locator('.session-row').first()).toBeVisible()
  await expect(page.locator('.session-row', { hasText: 'This device' })).toHaveCount(1)
  const n = await page.locator('.session-row').count()
  expect(n).toBeGreaterThan(1)
  await page.locator('.session-row').filter({ hasNotText: 'This device' }).first().getByRole('button', { name: 'Sign out' }).click()
  await expect(page.locator('.session-row')).toHaveCount(n - 1)
  const pref = page.locator('.pref-row', { hasText: 'daily digest' }).locator('input')
  await pref.uncheck()
  await expect.poll(() => count('PATCH /member/preferences')).toBeGreaterThan(0)
})

test('share link opens a public read-only page; revoke kills it', async ({ browser }) => {
  await nav('Tasks')
  await page.locator('.task-table tbody tr', { hasText: 'Created by someone else' }).locator('.task-open').click()
  await page.getByRole('button', { name: /Share link/ }).click()
  await expect(page.getByRole('button', { name: /Copy link/ })).toBeVisible()
  const tok = (await call('/task')).data.find(t => t.title === 'Created by someone else').shareToken
  const pub = await (await browser.newContext()).newPage()
  await pub.goto('/share/' + tok)
  await expect(pub.getByText('Created by someone else')).toBeVisible()
  await expect(pub.getByText('read-only')).toBeVisible()
  await page.getByRole('button', { name: 'Revoke link' }).click()
  await expect.poll(async () => (await call('/task')).data.find(t => t.title === 'Created by someone else').shareToken).toBeFalsy()
  await pub.reload()
  await expect(pub.getByText('invalid or has been revoked')).toBeVisible()
  await pub.close()
  await page.locator('.modal-backdrop').first().click({ position: { x: 5, y: 5 } })
})

test('deleting a team can be undone (server restore)', async () => {
  await nav('Teams')
  await page.locator('.entity-card', { hasText: 'Design Systems' }).locator('.danger-btn').first().click()
  await expect(page.locator('.entity-card', { hasText: 'Design Systems' })).toHaveCount(0)
  await page.locator('.undo-btn').click()
  await expect(page.locator('.entity-card', { hasText: 'Design Systems' })).toHaveCount(1)
  expect((await log()).some(l => l === 'POST /team/restore')).toBe(true)
})

test('change email (password -> OTP) and delete account', async ({ browser }) => {
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
  await signIn(p, 'm2@example.com'); await p.locator('.sidebar').waitFor()
  await p.locator('.nav-item-btn', { hasText: 'Profile' }).click()
  await p.getByRole('button', { name: /Change email/ }).click()
  await p.locator('.create-modal input[type=email]').fill('m2.new@example.com')
  await p.locator('.create-modal input[type=password]').fill('Wrong123!')
  await p.getByRole('button', { name: 'Send code' }).click()
  await expect(p.getByText('Incorrect password.').first()).toBeVisible()
  await p.locator('.create-modal input[type=password]').fill(PASSWORD)
  await p.getByRole('button', { name: 'Send code' }).click()
  await p.locator('.create-modal input[inputmode=numeric]').fill('123456')
  await p.getByRole('button', { name: 'Confirm email' }).click()
  await expect.poll(async () => (await call('/auth/signIn', 'POST', { email: 'm2.new@example.com', password: PASSWORD }, null)).status).toBe(200)

  // push toggle fails gracefully without an active service worker (dev server)
  await p.locator('.pref-row', { hasText: 'Show notifications' }).locator('input').check()
  await expect(p.locator('.toast-message')).toContainText(/service worker|permission/i)

  await p.getByRole('button', { name: /Delete my account/ }).click()
  const del = p.getByRole('button', { name: 'Delete account' })
  await expect(del).toBeDisabled()
  await p.locator('.create-modal input[type=password]').fill(PASSWORD)
  await p.locator('.create-modal input[placeholder=DELETE]').fill('DELETE')
  await del.click()
  await expect(p.getByRole('button', { name: /Sign in to Workspace/ })).toBeVisible()
  expect((await call('/auth/signIn', 'POST', { email: 'm2.new@example.com', password: PASSWORD }, null)).status).toBe(404)
  await p.close()
})

test('logout everywhere revokes the token', async () => {
  const r = await call('/auth/logout?flag=all', 'POST')
  expect(r.status).toBe(200)
  expect((await call('/member')).status).toBe(401)
})
