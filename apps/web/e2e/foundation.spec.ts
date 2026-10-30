import { expect, test } from '@playwright/test'

test('home sends visitors to setup or sign-in, with the mark and version', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/(setup|login)$/)
  await expect(page.getByRole('img', { name: 'Hearthside' })).toBeVisible()
  await expect(page.getByTestId('app-version')).toHaveText(/^Hearthside v\d+\.\d+\.\d+ · \S+$/)
  await expect(page.getByTestId('app-version')).not.toContainText('v0.0.0')
})

test('design system page renders the components', async ({ page }) => {
  await page.goto('/design')
  await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible()
  await expect(page.getByRole('status').first()).toContainText('Synced')
  await expect(page.getByLabel('spent 412 shekels 30').first()).toHaveText('−₪412.30')
})

test('manifest makes the app installable', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBe(true)
  const body = await res.json()
  expect(body.name).toBe('Hearthside')
  expect(body.display).toBe('standalone')
  expect(body.icons.length).toBeGreaterThanOrEqual(2)
})

test('theme choice applies and survives a reload', async ({ page }) => {
  await page.goto('/design')
  const html = page.locator('html')
  await page.getByRole('button', { name: 'System theme' }).click()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Light theme' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  const surface = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(surface).toBe('rgb(20, 24, 33)')
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Dark theme' })).toBeVisible()
})

test('health reports the app and database', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.ok()).toBe(true)
  const body = await res.json()
  expect(body.status).toBe('ok')
  expect(body.version).toMatch(/^\d+\.\d+\.\d+$/)
  expect(body.version).not.toBe('0.0.0')
  expect(body.commit).toBeTruthy()
  expect(body.db).toBe(
    process.env.E2E_EXPECT_DB ? 'ok' : expect.stringMatching(/^(ok|not_configured)$/),
  )
  expect(res.headers()['cache-control']).toBe('no-store')
})

test('responses carry security headers', async ({ request }) => {
  const res = await request.get('/')
  const headers = res.headers()
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['referrer-policy']).toBe('no-referrer')
  expect(headers['x-powered-by']).toBeUndefined()
})
