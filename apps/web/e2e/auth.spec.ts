import { expect, test, type Browser, type Page } from '@playwright/test'
import { makePdf } from '../../../packages/core/src/import/fixtures'

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

  // Welcome steps: about you, accounts, invite, done.
  await expect(owner).toHaveURL(/\/welcome$/)
  await expect(owner.getByRole('heading', { name: 'Welcome, Alex' })).toBeVisible()
  await expect(owner.getByText('Step 1 of 4')).toBeVisible()
  await owner.getByLabel('Name of your home').fill('The Test Home')
  await owner.getByRole('combobox', { name: 'Show amounts in' }).selectOption('USD')
  await owner.getByRole('button', { name: 'Continue' }).click()

  await expect(owner.getByRole('heading', { name: 'Your accounts' })).toBeVisible()
  await owner.getByRole('link', { name: 'Skip for now' }).click()

  await expect(owner.getByRole('heading', { name: 'Invite your home' })).toBeVisible()
  await expect(owner.getByText('Just you for now.')).toBeVisible()
  await owner.getByRole('link', { name: 'Back' }).click()
  await expect(owner.getByRole('heading', { name: 'Your accounts' })).toBeVisible()
  await owner.goBack()
  await owner.getByRole('link', { name: 'Just me for now' }).click()

  await expect(owner.getByRole('heading', { name: 'All set' })).toBeVisible()
  await expect(owner.getByTestId('welcome-summary')).toContainText('A second passkey')
  await owner.getByRole('button', { name: 'Go to my home' }).click()
  await expect(owner.getByRole('heading', { name: 'Hi Alex' })).toBeVisible()
  await expect(owner.getByText('Your home', { exact: true })).toBeVisible()

  // Once done, home no longer sends you to the welcome steps.
  await owner.reload()
  await expect(owner.getByRole('heading', { name: 'Hi Alex' })).toBeVisible()
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

async function join(
  browser: Browser,
  url: string,
  name: string,
  welcome: (page: Page) => Promise<void>,
) {
  const page = await newDevice(browser)
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Join The Test Home' })).toBeVisible()
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Create passkey and join' }).click()
  await expect(page.getByTestId('recovery-codes').getByRole('listitem')).toHaveCount(10)
  await page.getByRole('button', { name: 'I’ve saved them' }).click()
  await expect(page.getByRole('heading', { name: `Welcome, ${name}` })).toBeVisible()
  // Until they finish or skip the welcome steps, home sends them back.
  await page.goto('/')
  await expect(page).toHaveURL(/\/welcome$/)
  await welcome(page)
  await expect(page.getByRole('heading', { name: `Hi ${name}` })).toBeVisible()
  return page
}

test('the owner invites an adult and a viewer', async ({ browser }) => {
  const adultUrl = await invite('adult')
  const sam = await join(browser, adultUrl, 'Sam', async (page) => {
    // Adults: about you, their own accounts, done. No invite step.
    await expect(page.getByText('Step 1 of 3')).toBeVisible()
    await expect(page.getByLabel('Name of your home')).toHaveCount(0)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('region', { name: 'Import a statement' })).toBeVisible()
    await page.getByText('Add an account by hand').click()
    await page.getByLabel('Account name').fill('Sam card')
    await page.getByRole('button', { name: 'Add account' }).click()
    await expect(page.getByTestId('account-list')).toContainText('Sam card')
    await page.getByRole('link', { name: 'Continue' }).click()
    await expect(page.getByTestId('welcome-summary')).toContainText('1 account added')
    await page.getByRole('button', { name: 'Go to my home' }).click()
  })
  await expect(sam.getByText('Our home', { exact: true })).toBeVisible()

  // Invites work once.
  const again = await newDevice(browser)
  await again.goto(adultUrl)
  await expect(again.getByRole('button', { name: 'Create passkey and join' })).toHaveCount(0)
  await again.context().close()

  const viewerUrl = await invite('viewer')
  const kid = await join(browser, viewerUrl, 'Robin', async (page) => {
    // Viewers only look, so they can skip straight past everything.
    await expect(page.getByText('Step 1 of 2')).toBeVisible()
    await page.getByRole('button', { name: 'Skip the rest' }).click()
  })

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

const csv = [
  'Card statement for card ending 4821',
  'תאריך עסקה,שם בית העסק,סכום חיוב,פירוט נוסף',
  '05/10/2026,Corner Bakery,42.50,',
  '06/10/2026,Corner Bakery,18.00,',
  '07/10/2026,Home Store,100.00,תשלום 1 מתוך 6',
  '',
  ',סה"כ,160.50,',
].join('\n')

async function drop(page: Page, name: string, buffer: Buffer, mimeType: string) {
  await page.goto('/import')
  await page.getByLabel('Statement file').setInputFiles({ name, mimeType, buffer })
  return page.getByTestId('import-preview')
}

test('dropping a card statement picks or creates its account and imports it', async () => {
  await owner.goto('/')
  await owner.getByRole('link', { name: 'Import a statement' }).click()

  const preview = await drop(owner, 'visa-october.csv', Buffer.from(csv), 'text/csv')
  await expect(preview.getByRole('region', { name: 'Into Card ·4821' })).toContainText('3 new')
  await expect(preview).toContainText('Creates Card ·4821')
  await expect(preview.getByLabel('spent 42 shekels 50')).toBeVisible()
  await owner.getByRole('button', { name: 'Import 3 transactions' }).click()
  await expect(owner.getByText('Added 3 transactions to Card ·4821')).toBeVisible()
  await owner.getByRole('link', { name: 'See your accounts' }).click()
  await expect(owner.getByTestId('accounts-card')).toContainText('•••• 4821')
  await expect(owner.getByTestId('accounts-card')).toContainText('VISA')

  // The same file again finds the account and adds nothing.
  const again = await drop(owner, 'visa-october.csv', Buffer.from(csv), 'text/csv')
  await expect(again).toContainText('0 new · 3 already here')
  await expect(again).toContainText('Into Card ·4821')
  await expect(again).toContainText('You imported this exact file')
  await expect(owner.getByRole('button', { name: 'Import 0 transactions' })).toBeDisabled()

  await owner.goto('/transactions?month=2026-10')
  await expect(owner.getByRole('heading', { name: 'October 2026' })).toBeVisible()
  await expect(owner.getByTestId('transactions').getByRole('listitem')).toHaveCount(3)
  await expect(owner.getByLabel('Spent in October 2026')).toContainText('₪161')

  // The keyword list filed the bakery during import; the store waits for the model.
  await expect(owner.getByRole('button', { name: /^Home Store, Uncategorized/ })).toBeVisible()
  await owner
    .getByRole('button', { name: /^Corner Bakery, Groceries/ })
    .first()
    .click()
  await owner.getByRole('dialog').getByRole('button', { name: 'Groceries' }).click()
  await expect(owner.getByText('Also filed 1 other “Corner Bakery” transactions.')).toBeVisible()
  await owner.getByRole('combobox', { name: 'Category', exact: true }).selectOption('groceries')
  await owner.getByRole('button', { name: 'Filter' }).click()
  await expect(owner.getByTestId('transactions').getByRole('listitem')).toHaveCount(2)

  await owner.goto('/')
  await expect(owner.getByLabel('Spent in October')).toContainText('Groceries')

  // A household category of its own, with a keyword, files the store.
  await owner.goto('/settings')
  await owner.getByRole('button', { name: 'New category' }).click()
  await owner.getByLabel('Category name').fill('Decor')
  await owner.getByRole('button', { name: 'home', exact: true }).click()
  await owner.getByLabel(/^Keywords/).fill('home store')
  await owner.getByRole('button', { name: 'Add category' }).click()
  await expect(owner.getByTestId('custom-categories')).toContainText('Decor')
  await owner.goto('/transactions?month=2026-10')
  await expect(owner.getByRole('button', { name: /^Home Store, Decor/ })).toBeVisible()
})

test('a bank statement PDF imports by column position', async () => {
  const xs = [40, 110, 330, 400, 480]
  const row = (y: number, cells: string[]) =>
    cells.flatMap((text, i) => (text ? [{ x: xs[i]!, y, text }] : []))
  const pdf = makePdf([
    [
      { x: 40, y: 790, text: 'Account 12-345-678901' },
      ...row(750, ['Date', 'Transaction', 'Debit', 'Credit', 'Balance (NIS)']),
      ...row(735, ['01/10/2026', 'Salary', '', '16,200.00', '20,000.00']),
      ...row(720, ['03/10/2026', 'Rent', '5,500.00', '', '14,500.00']),
    ],
  ])
  const preview = await drop(owner, 'ops.pdf', Buffer.from(pdf), 'application/pdf')
  await expect(preview).toContainText('Creates Bank account ·8901')
  await expect(preview.getByLabel('received 16200 shekels')).toBeVisible()
  await expect(preview.getByLabel('spent 5500 shekels')).toBeVisible()
  await owner.getByRole('button', { name: 'Import 2 transactions' }).click()
  await expect(owner.getByText('Added 2 transactions to Bank account ·8901')).toBeVisible()

  // Cards and bank accounts have their own views.
  await owner.goto('/transactions?month=2026-10')
  await expect(owner.getByTestId('transactions').getByRole('listitem')).toHaveCount(5)
  await owner
    .getByRole('navigation', { name: 'Account type' })
    .getByRole('link', { name: 'Bank accounts' })
    .click()
  await expect(owner.getByTestId('transactions').getByRole('listitem')).toHaveCount(2)
  await expect(owner.getByLabel('Money out in October 2026')).toContainText('₪5,500')
  await owner
    .getByRole('navigation', { name: 'Account type' })
    .getByRole('link', { name: 'Cards' })
    .click()
  await expect(owner.getByTestId('transactions').getByRole('listitem')).toHaveCount(3)

  // Accounts are grouped by type and can be renamed.
  await owner
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Accounts' })
    .click()
  await expect(owner.getByTestId('accounts-bank')).toContainText('•••• 8901')
  await owner.getByRole('link', { name: 'Edit Bank account ·8901' }).click()
  await owner.getByLabel('Account name').fill('Household bank')
  await owner.getByRole('button', { name: 'Save' }).click()
  await expect(owner.getByText('Saved.')).toBeVisible()
  await expect(owner.getByRole('heading', { name: 'Household bank' })).toBeVisible()

  // Undo removes what that import added.
  await owner.goto('/import')
  await owner.getByRole('button', { name: 'Undo import ops.pdf' }).click()
  await owner.getByRole('button', { name: 'Remove its transactions' }).click()
  await expect(owner.getByRole('button', { name: 'Undo import ops.pdf' })).toHaveCount(0)
  await owner.goto('/transactions?month=2026-10')
  await expect(owner.getByTestId('transactions').getByRole('listitem')).toHaveCount(3)
})

test('settings show the app version and sign-in activity', async () => {
  await owner.goto('/settings')
  await expect(owner.getByTestId('app-version')).toHaveText(/^Hearthside v\d+\.\d+\.\d+/)
  await expect(owner.getByRole('region', { name: 'Recent sign-in activity' })).toBeVisible()

  // The profile lives in Settings too, and the welcome steps can be shown again.
  await expect(owner.getByRole('combobox', { name: 'Show amounts in' })).toHaveValue('USD')
  await owner.getByRole('combobox', { name: 'Show amounts in' }).selectOption('ILS')
  await owner.getByRole('button', { name: 'Save' }).click()
  await expect(owner.getByText('Saved.')).toBeVisible()
  await owner.getByRole('button', { name: 'Show the welcome steps again' }).click()
  await expect(owner).toHaveURL(/\/welcome$/)
  await owner.goto('/')
  await expect(owner).toHaveURL(/\/welcome$/)
  await owner.getByRole('button', { name: 'Skip the rest' }).click()
  await expect(owner.getByRole('heading', { name: 'Hi Alex' })).toBeVisible()
  await owner.context().close()
})
