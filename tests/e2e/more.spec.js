import { test, expect } from '@playwright/test'

const bootDemo = async page => {
  page.on('dialog', d => d.accept('My template'))
  await page.goto('/app')
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('taskverse-demo', 'true'); localStorage.setItem('taskverse-token', 'demo-jwt-token') })
  await page.goto('/app?tab=Tasks')
  await page.locator('.task-table tbody tr').first().waitFor()
}
const rows = page => page.locator('.task-table tbody tr:not(:has(.empty-state))')
const closeModal = async page => { await page.locator('.modal-backdrop').first().click({ position: { x: 5, y: 5 } }); await expect(page.locator('.modal-backdrop')).toHaveCount(0) }

test.describe('workspace extras (demo mode)', () => {
  test.describe.configure({ mode: 'serial' })
  let page
  test.beforeAll(async ({ browser }) => { page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage(); await bootDemo(page) })
  test.afterAll(async () => page.context().close())

  test('undo restores a deleted task; dismissing commits it', async () => {
    const n = await rows(page).count()
    await page.locator('.task-table tbody tr').first().locator('.danger-btn').click()
    await expect(rows(page)).toHaveCount(n - 1)
    await expect(page.locator('.undo-toast')).toContainText('deleted')
    await page.locator('.undo-btn').click()
    await expect(rows(page)).toHaveCount(n)
    await page.locator('.task-table tbody tr').first().locator('.danger-btn').click()
    await page.locator('.undo-toast .icon-btn').click() // dismiss = commit now
    await expect(page.locator('.undo-toast')).toHaveCount(0)
    await expect(rows(page)).toHaveCount(n - 1)
  })

  test('undo a bulk delete', async () => {
    const n = await rows(page).count()
    await page.locator('.task-table thead .sel-col input').check()
    await page.getByRole('button', { name: 'Delete selected' }).click()
    await expect(page.locator('.task-table tbody .empty-state')).toBeVisible()
    await page.locator('.undo-btn').click()
    await expect(rows(page)).toHaveCount(n)
  })

  test('template creates a task with checklist and schedule', async () => {
    await page.getByRole('button', { name: 'New Task' }).click()
    await page.locator('.tpl-chip button', { hasText: 'Employee onboarding' }).click()
    await expect(page.locator('.create-modal input[maxlength="150"]')).toHaveValue('Onboard new hire')
    await page.getByRole('button', { name: /Create Task/ }).last().click()
    const row = page.locator('.task-table tbody tr', { hasText: 'Onboard new hire' })
    await expect(row).toBeVisible()
    await expect(row.locator('.kb-sub-inline')).toContainText('0/6')
  })

  test('time tracking: estimate, timer and manual entry feed the report', async () => {
    await page.locator('.task-table tbody tr', { hasText: 'Onboard new hire' }).locator('.task-open').click()
    await page.locator('.time-est input').fill('2')
    await page.locator('.time-est input').blur()
    await page.getByRole('button', { name: /Start timer/ }).click()
    await expect(page.getByRole('button', { name: /Stop/ })).toBeVisible()
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: /Stop/ }).click()
    await page.locator('input[placeholder^="Log time"]').fill('1h30m')
    await page.keyboard.press('Enter')
    await expect(page.locator('.att-row', { hasText: '1h 30m' })).toBeVisible()
    await expect(page.locator('.time-sum strong')).toContainText('1h 31m')
    await closeModal(page)
    await page.locator('.nav-item-btn', { hasText: 'Overview' }).click()
    await expect(page.locator('.tc')).toContainText('Onboard new hire')
  })

  test('team dashboard shows burn-down and workload', async () => {
    await page.locator('.nav-item-btn', { hasText: 'Teams' }).click()
    await page.locator('.entity-card').first().getByRole('button', { name: /Dashboard/ }).click()
    await expect(page.locator('svg.burn')).toBeVisible()
    await expect(page.locator('.wl-row').first()).toBeVisible()
    await expect(page.locator('.kpi')).toHaveCount(4)
    await page.locator('.scope-pick select').selectOption('all')
    await expect(page.locator('.ins-grid')).toBeVisible()
  })

  test('mobile: top bar collapses into a "..." menu without overflow', async () => {
    await page.setViewportSize({ width: 390, height: 800 })
    await expect(page.locator('.top-actions .search-box')).toBeHidden()
    await page.locator('.more-wrap > .icon-btn').click()
    await expect(page.locator('.more-panel')).toContainText('Sign out')
    await expect(page.locator('.more-panel')).toContainText('Refresh')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(4)
    await page.locator('.notif-backdrop').click()
    await page.setViewportSize({ width: 1500, height: 950 })
  })
})

test('changes sync between open tabs', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
  const a = await ctx.newPage(); await bootDemo(a)
  const b = await ctx.newPage(); await b.goto('/app?tab=Tasks'); await b.locator('.task-table tbody tr').first().waitFor()
  await expect(b.locator('select.team-filter option[value="xtab"]')).toHaveCount(0)
  await a.locator('.task-open').first().click()
  await a.locator('input[list="tag-suggestions"]').fill('xtab')
  await a.keyboard.press('Enter')
  await expect(b.locator('select.team-filter option[value="xtab"]')).toHaveCount(1)
  await ctx.close()
})

test('real-time: a pushed server event refreshes the UI and shows its message', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
  const page = await ctx.newPage()
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
  const team = { _id: 'tm1', name: 'Core', teamMembers: [], teamAdmins: [], addedBy: 'u1', createdAt: '2026-01-01' }
  const mk = (id, title) => ({ _id: id, title, description: 'desc here', startDate: '2026-11-01', endDate: '2026-11-20', team, createdBy: 'u1' })
  let pushed = false
  await page.route('http://localhost:3000/**', async route => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const json = data => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ data }) })
    if (url.pathname === '/events') {
      await new Promise(r => setTimeout(r, 1500))
      pushed = true
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: 'data: {"type":"task.created","actorId":"someone-else","message":"Sam added a new task"}\n\n' })
    }
    if (url.pathname === '/task') return json(pushed ? [mk('t1', 'First task'), mk('t2', 'Pushed task')] : [mk('t1', 'First task')])
    if (url.pathname === '/team') return json([team])
    if (url.pathname === '/member/profile') return json({ _id: 'u1', fname: 'Test', lname: 'User', email: 't@x.io', role: 'admin' })
    return json([])
  })
  await page.goto('/app')
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('taskverse-token', 'real-token'); localStorage.setItem('taskverse-user', JSON.stringify({ _id: 'u1', fname: 'Test', role: 'admin' })) })
  await page.goto('/app?tab=Tasks')
  await expect(page.locator('.task-table tbody tr', { hasText: 'First task' })).toBeVisible()
  await expect(page.locator('.task-table tbody tr', { hasText: 'Pushed task' })).toHaveCount(0)
  await expect(page.locator('.task-table tbody tr', { hasText: 'Pushed task' })).toBeVisible({ timeout: 8000 })
  await expect(page.locator('.toast-message')).toContainText('Sam added a new task')
  await ctx.close()
})

test('my assignments: clicking a card opens the task detail card', async ({ browser }) => {
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
  await p.goto('/app')
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('taskverse-demo', 'true'); localStorage.setItem('taskverse-token', 'demo-jwt-token') })
  await p.goto('/app')
  await p.locator('.nav-item-btn', { hasText: 'My assignments' }).click()
  const card = p.locator('.assignment-card').first()
  const title = (await card.locator('h3').innerText()).trim()
  await card.locator('h3').click()
  await expect(p.locator('.task-detail')).toBeVisible()
  await expect(p.locator('.td-header h2')).toContainText(title)
  await p.close()
})

test('accessibility: dialogs trap focus, close with Esc and return focus; offline banner', async ({ browser, context: _c }) => {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
  const p = await ctx.newPage()
  await p.goto('/app')
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('taskverse-demo', 'true'); localStorage.setItem('taskverse-token', 'demo-jwt-token') })
  await p.goto('/app?tab=Tasks')
  await p.locator('.task-table tbody tr').first().waitFor()
  const open = p.getByRole('button', { name: 'New Task' })
  await open.click()
  const dlg = p.getByRole('dialog')
  await expect(dlg).toBeVisible()
  await expect(dlg).toHaveAttribute('aria-modal', 'true')
  expect(await p.evaluate(() => !!document.activeElement.closest('.modal-backdrop'))).toBe(true)
  for (let i = 0; i < 40; i++) await p.keyboard.press('Tab')
  expect(await p.evaluate(() => !!document.activeElement.closest('.modal-backdrop'))).toBe(true) // focus never leaves
  await p.keyboard.press('Escape')
  await expect(dlg).toHaveCount(0)
  await expect(open).toBeFocused()

  await ctx.setOffline(true)
  await expect(p.locator('.offline-banner')).toBeVisible()
  await ctx.setOffline(false)
  await expect(p.locator('.offline-banner')).toHaveCount(0)
  await ctx.close()
})

test('arabic: UI text without t() is translated, RTL is set, and English is restored', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
  const p = await ctx.newPage()
  await p.goto('/app')
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('taskverse-demo', 'true'); localStorage.setItem('taskverse-token', 'demo-jwt-token') })
  await p.goto('/app?tab=Profile%20%26%20security')
  await p.locator('.sidebar').waitFor()
  await p.locator('.lang-btn').click()
  await expect(p.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(p.getByText('تغيير كلمة المرور').first()).toBeVisible()
  await expect(p.getByText('Change Password')).toHaveCount(0)
  await p.locator('.nav-item-btn').nth(3).click() // Members
  await expect(p.getByText('حسابات المستخدمين').first()).toBeVisible()
  await p.locator('.lang-btn').click()
  await expect(p.locator('html')).toHaveAttribute('dir', 'ltr')
  await p.locator('.nav-item-btn').nth(5).click()
  await expect(p.getByText('Change Password').first()).toBeVisible()
  await ctx.close()
})

test('demo: member card role picker switches Viewer / Member / Admin', async ({ browser }) => {
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
  p.on('dialog', d => d.accept())
  await p.goto('/app')
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('taskverse-demo', 'true'); localStorage.setItem('taskverse-token', 'demo-jwt-token') })
  await p.goto('/app?tab=Members')
  await p.locator('.member-row-click').nth(1).click()
  const pick = name => p.locator('.role-picker').getByRole('radio', { name })
  await pick('Viewer (read-only)').click()
  await expect(pick('Viewer (read-only)')).toHaveAttribute('aria-checked', 'true')
  await pick('Admin').click()
  await expect(pick('Admin')).toHaveAttribute('aria-checked', 'true')
  await pick('Member').click()
  await expect(pick('Member')).toHaveAttribute('aria-checked', 'true')
  await p.close()
})

test('access control (demo): master switch, per-person permissions, role presets and preview', async ({ browser }) => {
  const p = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
  p.on('dialog', d => d.accept())
  await p.goto('/app')
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('taskverse-demo', 'true'); localStorage.setItem('taskverse-token', 'demo-jwt-token') })
  await p.goto('/app')
  await p.locator('.nav-item-btn', { hasText: 'Access control' }).click()
  const sw = p.getByRole('switch')
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  await expect(p.getByText('Access control is OFF.')).toBeVisible()
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'true')

  // pick a non-admin person and block "Create tasks" + "Tasks page" just for them
  const row = p.locator('.ac-row').filter({ has: p.locator('.role-badge.r-member') }).first()
  const who = (await row.locator('strong').innerText()).trim()
  await row.click()
  const perm = label => p.locator('.ac-perm', { hasText: label })
  await perm('Create tasks').getByRole('radio', { name: 'Block' }).click()
  await expect(perm('Create tasks')).toHaveClass(/blocked/)
  await expect(p.locator('.ac-custom-pill')).toContainText('1 custom')

  // preview: the New Task buttons disappear, menus the person may still use remain
  await p.getByRole('button', { name: /Preview as this person/ }).click()
  await expect(p.locator('.preview-bar')).toContainText(who)
  await expect(p.getByRole('button', { name: 'Create Task' })).toHaveCount(0)
  await expect(p.locator('.nav-item-btn', { hasText: 'Access control' })).toHaveCount(0)
  await expect(p.locator('.nav-item-btn', { hasText: 'Tasks' })).toBeVisible()
  await p.getByRole('button', { name: 'Exit preview' }).first().click()

  // a role preset change applies to everyone with that role: Member loses "Tasks page"
  await p.getByRole('tab', { name: 'Role permissions' }).click()
  await p.getByLabel('Member: Tasks page').uncheck()
  await p.getByRole('tab', { name: 'People' }).click()
  await p.getByRole('button', { name: /Preview as this person/ }).click()
  await expect(p.locator('.nav-item-btn', { hasText: /^\s*Tasks/ })).toHaveCount(0)
  await p.getByRole('button', { name: 'Exit preview' }).first().click()
  await expect(p.getByRole('tab', { name: 'History' })).toBeVisible()
  await p.getByRole('tab', { name: 'History' }).click()
  await expect(p.locator('.act-row-sm').first()).toBeVisible()

  // switching it off restores everything
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  await expect(p.locator('.nav-item-btn', { hasText: /^\s*Tasks/ })).toBeVisible()
  await p.close()
})
