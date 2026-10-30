import { expect, test, type Browser, type Page } from '@playwright/test'

// One household per deployment, so these steps share state and run in order
// against a fresh database. Chromium only: it has a virtual passkey device.
test.describe.configure({ mode: 'serial', retries: 0 })
test.skip(({ browserName }) => browserName !== 'chromium', 'needs the CDP virtual authenticator')

async function withPasskeyDevice(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  return page
}

async function newDevice(browser: Browser) {
  const context = await browser.newContext()
  return withPasskeyDevice(await context.newPage())
}

let owner: Page
let recoveryCode: string

test('the first visitor sets up the home with a passkey', async ({ browser }) => {
  owner = await newDevice(browser)
  await owner.goto('/')
  await expect(owner).toHaveURL(/\/setup$/)
  await owner.getByLabel('Name of your home').fill('The Test Home')
  await owner.getByLabel('Your name').fill('Alex')
  await owner.getByRole('button', { name: 'Create passkey' }).click()

  const codes = owner.getByTestId('recovery-codes').getByRole('listitem')
  await expect(codes).toHaveCount(10)
  recoveryCode = (await codes.first().textContent())!.trim()
  expect(recoveryCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)

  await owner.getByRole('button', { name: 'I’ve saved them' }).click()
  await expect(owner.getByRole('heading', { name: 'Hi Alex' })).toBeVisible()
  await expect(owner.getByText('Your home', { exact: true })).toBeVisible()
})

test('setup is closed once the home exists', async ({ page }) => {
  await page.goto('/setup')
  await expect(page).toHaveURL(/\/login$/)
  const res = await page.request.post('/api/auth/setup/options', {
    data: { householdName: 'Another', name: 'Mallory' },
  })
  expect(res.ok()).toBe(false)
})

test('signing out and back in with the same passkey', async () => {
  await owner.goto('/settings')
  await owner.getByRole('button', { name: 'Sign out' }).click()
  await expect(owner).toHaveURL(/\/login$/)

  await owner.goto('/settings')
  await expect(owner).toHaveURL(/\/login$/)

  await owner.getByRole('button', { name: 'Sign in with passkey' }).click()
  await expect(owner.getByRole('heading', { name: 'Hi Alex' })).toBeVisible()
})

test('a device without a known passkey cannot sign in', async ({ browser }) => {
  const stranger = await newDevice(browser)
  await stranger.goto('/login')
  await stranger.getByRole('button', { name: 'Sign in with passkey' }).click()
  await expect(stranger.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible()
  await expect(stranger).toHaveURL(/\/login$/)
  await stranger.context().close()
})

async function invite(role: 'adult' | 'viewer') {
  await owner.goto('/settings')
  await owner.reload()
  await owner
    .getByRole('radio', {
      name: role === 'adult' ? 'Connect accounts and see shared data' : 'Only view shared data',
    })
    .check()
  await owner.getByRole('button', { name: 'Create invite link' }).click()
  const url = (await owner.getByTestId('invite-url').textContent())!.trim()
  expect(url).toMatch(/\/invite\/[\w-]+$/)
  return url
}

async function join(browser: Browser, url: string, name: string) {
  const page = await newDevice(browser)
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Join The Test Home' })).toBeVisible()
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Create passkey and join' }).click()
  await expect(page.getByTestId('recovery-codes').getByRole('listitem')).toHaveCount(10)
  await page.getByRole('button', { name: 'I’ve saved them' }).click()
  await expect(page.getByRole('heading', { name: `Hi ${name}` })).toBeVisible()
  return page
}

test('the owner invites an adult and a viewer', async ({ browser }) => {
  const adultUrl = await invite('adult')
  const sam = await join(browser, adultUrl, 'Sam')
  await expect(sam.getByText('Our home', { exact: true })).toBeVisible()

  // Invites work once.
  const again = await newDevice(browser)
  await again.goto(adultUrl)
  await expect(again.getByRole('button', { name: 'Create passkey and join' })).toHaveCount(0)
  await again.context().close()

  const viewerUrl = await invite('viewer')
  const kid = await join(browser, viewerUrl, 'Robin')

  // Only the owner manages members.
  await kid.goto('/settings')
  await expect(kid.getByRole('button', { name: 'Create invite link' })).toHaveCount(0)
  await sam.context().close()
  await kid.context().close()

  await owner.goto('/settings')
  const members = owner.getByTestId('member-list').getByRole('listitem')
  await expect(members).toHaveCount(3)
  await expect(members.filter({ hasText: 'Sam' })).toContainText('Adult')
  await expect(members.filter({ hasText: 'Robin' })).toContainText('Viewer')
})

test('a recovery code signs in once and asks for a new passkey', async ({ browser }) => {
  const phone = await newDevice(browser)
  await phone.goto('/login')
  await phone.getByRole('link', { name: 'Lost your passkey? Use a recovery code' }).click()
  await phone.getByLabel('Recovery code').fill(recoveryCode.toLowerCase())
  await phone.getByRole('button', { name: 'Continue' }).click()
  await expect(phone.getByRole('heading', { name: 'Welcome back, Alex' })).toBeVisible()

  // Until a passkey is added, the rest of the app stays closed.
  await phone.goto('/')
  await expect(phone).toHaveURL(/\/recovered$/)

  await phone.getByRole('button', { name: 'Add a passkey' }).click()
  await expect(phone).toHaveURL(/\/settings$/)
  await expect(phone.getByText('9 of 10 unused.')).toBeVisible()
  await expect(phone.getByText('Add a second passkey')).toHaveCount(0)
  await phone.context().close()

  // The same code does not work twice.
  const other = await newDevice(browser)
  await other.goto('/recover')
  await other.getByLabel('Recovery code').fill(recoveryCode)
  await other.getByRole('button', { name: 'Continue' }).click()
  await expect(other.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible()
  await other.context().close()
})

test('settings show the app version and sign-in activity', async () => {
  await owner.goto('/settings')
  await expect(owner.getByTestId('app-version')).toHaveText(/^Hearthside v\d+\.\d+\.\d+/)
  await expect(owner.getByRole('region', { name: 'Recent sign-in activity' })).toBeVisible()
  await owner.context().close()
})
