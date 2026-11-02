import { test, expect } from '@playwright/test'

// Runs against `vite preview` (production build) because the service worker is disabled in dev.
test('manifest is valid and icons load', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifest = await (await request.get(href)).json()
  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toBe('/app')
  for (const icon of manifest.icons.filter(i => i.type === 'image/png')) {
    const res = await request.get(icon.src)
    expect(res.ok(), icon.src).toBeTruthy()
  }
  expect(manifest.icons.some(i => i.purpose === 'maskable')).toBe(true)
})

test('service worker registers and the shell opens offline', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload() // let the SW take control and warm the cache
  await page.waitForFunction(() => navigator.serviceWorker.controller)
  await context.setOffline(true)
  await page.goto('/')
  await expect(page.locator('#app')).not.toBeEmpty()
  await context.setOffline(false)
})
