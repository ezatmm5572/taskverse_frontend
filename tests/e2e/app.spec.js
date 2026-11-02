import { test, expect } from '@playwright/test'

// Every flow runs against the built-in Demo Mode, so no backend is needed.
test.describe.configure({ mode: 'serial' })

let page
test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 950 } })).newPage()
  page.on('dialog', d => d.accept())
  await page.goto('/app')
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('taskverse-demo', 'true'); localStorage.setItem('taskverse-token', 'demo-jwt-token') })
  await page.goto('/app')
  await page.locator('.sidebar').waitFor()
})
test.afterAll(async () => page.context().close())

const nav = name => page.locator('.nav-item-btn', { hasText: name }).click()
const openFirstTask = async () => { await page.locator('.task-open').first().click(); await page.locator('.task-detail').waitFor() }
const closeModal = async () => { await page.locator('.modal-backdrop').first().click({ position: { x: 5, y: 5 } }); await expect(page.locator('.modal-backdrop')).toHaveCount(0) }

test('overview shows insights and stats', async () => {
  await expect(page.locator('.ins-grid')).toBeVisible()
  await expect(page.locator('.stat-card')).toHaveCount(4)
})

test('task card: priority, tags, subtasks, comments with @mention, attachments', async () => {
  await nav('Tasks')
  await openFirstTask()
  await page.locator('.td-status-opt.prio.high').click()
  await expect(page.locator('.td-status-opt.prio.high.active')).toBeVisible()

  await page.locator('input[list="tag-suggestions"]').fill('backend')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tag-chip', { hasText: 'backend' }).first()).toBeVisible()

  await page.locator('input[placeholder*="subtask"]').fill('Write tests')
  await page.keyboard.press('Enter')
  await page.locator('.att-row', { hasText: 'Write tests' }).locator('input[type=checkbox]').check()

  const box = page.locator('.mi input')
  await box.click()
  await box.pressSequentially('Hi @ele')
  await expect(page.locator('.mi-list li').first()).toContainText('ElenaRostova')
  await page.keyboard.press('Enter')
  await box.pressSequentially('please review')
  await page.keyboard.press('Enter')
  await expect(page.locator('.cmt .mention', { hasText: '@ElenaRostova' })).toBeVisible()

  await page.locator('input[type=file]').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(page.locator('.att-row', { hasText: 'note.txt' })).toBeVisible()
})

test('rich text description renders safely (HTML is escaped)', async () => {
  const ta = page.locator('.rt textarea').first()
  await ta.fill('**Bold** and _italic_ with `code`\n- one\n- two\n<img src=x onerror=alert(1)>')
  await page.locator('.rt-tabs button', { hasText: 'Preview' }).first().click()
  const view = page.locator('.rt-view').first()
  await expect(view.locator('strong')).toHaveText('Bold')
  await expect(view.locator('li')).toHaveCount(2)
  await expect(view.locator('img')).toHaveCount(0)
})

test('schedule: repeating task spawns the next occurrence when completed', async () => {
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Daily' }) }).selectOption('weekly')
  await page.locator('select').filter({ has: page.locator('option', { hasText: '1 week before' }) }).selectOption('7')
  await closeModal()
  await openFirstTask()
  const title = (await page.locator('.td-header h2').innerText()).trim()
  await closeModal()
  const before = await page.locator('.task-table tbody tr', { hasText: title }).count()
  await page.locator('.task-table tbody tr', { hasText: title }).first().locator('.task-check-btn').click()
  await expect(page.locator('.task-table tbody tr', { hasText: title })).toHaveCount(before + 1)
})

test('remove assignee and bulk-assign with "select whole team"', async () => {
  await openFirstTask()
  const n = await page.locator('.td-person').count()
  await page.locator('.td-person .td-x').first().click()
  await expect(page.locator('.td-person')).toHaveCount(n - 1)
  await page.getByRole('button', { name: 'Select whole team' }).first().click()
  await page.getByRole('button', { name: /Assign \d+ selected/ }).click()
  await closeModal()
})

test('board drag-and-drop changes status; calendar renders', async () => {
  await page.locator('.seg button', { hasText: 'Board' }).click()
  const card = page.locator('.kb-col').nth(1).locator('.kb-card').first()
  const title = (await card.locator('strong').innerText()).trim()
  await card.dragTo(page.locator('.kb-col').nth(2).locator('.kb-list'))
  await expect(page.locator('.kb-col').nth(2).locator('.kb-card', { hasText: title })).toHaveCount(1)
  await page.locator('.seg button', { hasText: 'Calendar' }).click()
  await expect(page.locator('.cal-grid')).toBeVisible()
  await page.locator('.seg button', { hasText: 'List' }).click()
})

test('export: CSV download (BOM + header) and PDF report page', async () => {
  await page.locator('.export-wrap button').first().click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV (Excel)' }).click()])
  expect(download.suggestedFilename()).toMatch(/^taskverse-tasks-\d{4}-\d{2}-\d{2}\.csv$/)
  const chunks = []
  for await (const c of await download.createReadStream()) chunks.push(c)
  expect(Buffer.concat(chunks).toString('utf8').startsWith('﻿Title,Description,Team')).toBe(true)

  await page.locator('.export-wrap button').first().click()
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'PDF report' }).click()])
  await expect(popup.locator('h1')).toContainText('Tasks report')
  await expect(popup.locator('table')).toHaveCount(4)
  await popup.close()
})

test('bulk select, sort, bulk status and bulk delete', async () => {
  await page.locator('select.team-filter').last().selectOption('priority')
  await page.locator('.task-table tbody .sel-col input').nth(0).check()
  await page.locator('.task-table tbody .sel-col input').nth(1).check()
  await expect(page.locator('.bulk-bar')).toBeVisible()
  await page.getByRole('button', { name: 'Mark completed' }).click()
  await page.locator('.task-table thead .sel-col input').check()
  await page.getByRole('button', { name: 'Delete selected' }).click()
  await expect(page.locator('.task-table tbody .empty-state')).toBeVisible()
})

test('team card: viewer/editor roles, bulk add with select all', async () => {
  await page.reload()
  await page.locator('.sidebar').waitFor()
  await nav('Teams')
  await page.locator('.entity-card').nth(2).click()
  const sel = page.locator('.team-member-row select').nth(1)
  await sel.selectOption('teamViewer')
  await expect(sel).toHaveValue('teamViewer')
  await page.getByRole('button', { name: 'Select all' }).last().click()
  await expect(page.locator('.picker-count').first()).toContainText('selected')
  await closeModal()
})

test('member card shows profile, teams (with role) and tasks', async () => {
  await nav('Members')
  await page.locator('.member-row-click').nth(1).click()
  await expect(page.locator('.kv-grid')).toBeVisible()
  await expect(page.locator('.team-task-row').first()).toBeVisible()
  await closeModal()
})

test('notifications: bell lists items and marks them read', async () => {
  await page.locator('.notif-wrap .icon-btn').click()
  await expect(page.locator('.notif-item').first()).toBeVisible()
  await page.getByRole('button', { name: 'Mark all read' }).click()
  await expect(page.locator('.notif-count')).toHaveCount(0)
  await page.locator('.notif-backdrop').click()
})

test('arabic switches the page to RTL', async () => {
  await page.locator('.lang-btn').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('.nav-item-btn', { hasText: 'المهام' })).toBeVisible()
  await page.locator('.lang-btn').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
})
