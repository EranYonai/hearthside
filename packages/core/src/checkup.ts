import type { AssetClass } from './invest'
import type { Minor } from './money'

/**
 * A passive-investing check-up: a few gentle, general observations, never buy or sell orders.
 * Everything here is general education, not advice.
 */

export interface InvestSettings {
  /** Target share of stocks in percent; the rest is bonds and cash. */
  stocksTarget: number
  /** Months of spending to keep somewhere safe. */
  emergencyMonths: number
  /** The check-up can be turned off. */
  checkupOn: boolean
}

export const DEFAULT_INVEST_SETTINGS: InvestSettings = {
  stocksTarget: 80,
  emergencyMonths: 6,
  checkupOn: true,
}

export class InvestSettingsError extends Error {}

export function cleanInvestSettings(input: {
  stocksTarget?: unknown
  emergencyMonths?: unknown
  checkupOn?: unknown
}): InvestSettings {
  const whole = (v: unknown) => (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v)
  const target = whole(input.stocksTarget)
  const months = whole(input.emergencyMonths)
  if (typeof target !== 'number' || !Number.isInteger(target) || target < 0 || target > 100)
    throw new InvestSettingsError('Pick a stocks share from 0 to 100%')
  if (typeof months !== 'number' || !Number.isInteger(months) || months < 0 || months > 24)
    throw new InvestSettingsError('Pick 0 to 24 months')
  return { stocksTarget: target, emergencyMonths: months, checkupOn: input.checkupOn !== false }
}

/** Read stored settings, filling in defaults for anything missing. */
export function investSettings(stored: Partial<InvestSettings> | null | undefined): InvestSettings {
  return { ...DEFAULT_INVEST_SETTINGS, ...(stored ?? {}) }
}

const STOCKS: readonly AssetClass[] = ['global_stocks', 'local_stocks']
const SAFE: readonly AssetClass[] = ['bonds', 'cash']

/** Funds above this yearly fee (percent) get a gentle mention. */
export const HIGH_FEE = 0.5
/** Split drift (percentage points) before the check-up mentions it. */
export const DRIFT_POINTS = 5
/** Days without a deposit before steady deposits are mentioned. */
export const DEPOSIT_GAP_DAYS = 45

export interface CheckupInput {
  settings: InvestSettings
  /** Value per asset class, all in one currency. */
  byClass: Partial<Record<AssetClass, Minor>>
  /** Securities with a known yearly fee (percent). */
  fees: { name: string; fee: number }[]
  /** Securities held, so the fee check knows how many lack a fee. */
  securities: number
  /** Cash held in investment accounts, in the same currency. */
  cashMinor: Minor
  /** Average monthly spending, same currency; null when there's too little history. */
  monthlySpendMinor: Minor | null
  /** Days of deposits, newest first. */
  depositDays: string[]
  today: string
}

export type CheckupStatus = 'ok' | 'nudge' | 'info'

export interface CheckupItem {
  key: 'split' | 'fees' | 'home' | 'emergency' | 'deposits'
  status: CheckupStatus
  title: string
  detail: string
  /** Numbers the page shows next to the text. */
  numbers?: Record<string, number>
}

function pct(n: number): string {
  return `${Math.round(n)}%`
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function checkup(input: CheckupInput): CheckupItem[] {
  const items: CheckupItem[] = []
  const sum = (classes: readonly AssetClass[]) =>
    classes.reduce((n, c) => n + (input.byClass[c] ?? 0), 0)
  const stocks = sum(STOCKS)
  const safe = sum(SAFE)
  const target = input.settings.stocksTarget

  // Split against the household's target.
  if (stocks + safe > 0) {
    const share = (stocks / (stocks + safe)) * 100
    const drift = share - target
    const split = `${pct(share)} stocks / ${pct(100 - share)} bonds and cash`
    const goal = `${target}/${100 - target}`
    items.push(
      Math.abs(drift) <= DRIFT_POINTS
        ? {
            key: 'split',
            status: 'ok',
            title: 'Your split is on target',
            detail: `${split}, close to your ${goal} target.`,
            numbers: { share, target },
          }
        : {
            key: 'split',
            status: 'nudge',
            title: drift > 0 ? 'A little heavy on stocks' : 'A little light on stocks',
            detail: `${split} against your ${goal} target. Many passive investors steer back by pointing new money at the ${drift > 0 ? 'bonds and cash' : 'stocks'} side, rather than selling.`,
            numbers: { share, target },
          },
    )
  } else {
    items.push({
      key: 'split',
      status: 'info',
      title: 'No split to check yet',
      detail: `Once holdings have prices, this compares stocks against bonds and cash with your ${target}/${100 - target} target.`,
    })
  }

  // Fees.
  const high = input.fees.filter((f) => f.fee > HIGH_FEE)
  const missing = input.securities - input.fees.length
  if (high.length > 0)
    items.push({
      key: 'fees',
      status: 'nudge',
      title:
        high.length === 1
          ? 'One fund costs more than most'
          : `${high.length} funds cost more than most`,
      detail: `${high.map((f) => `${f.name} (${f.fee}%)`).join(', ')} charge${high.length === 1 ? 's' : ''} over ${HIGH_FEE}% a year. Broad index funds often charge well under 0.3%, and fees add up over decades.`,
    })
  else if (input.fees.length > 0)
    items.push({
      key: 'fees',
      status: 'ok',
      title: 'Fees look low',
      detail: `Every fund with a known fee charges ${HIGH_FEE}% a year or less.${missing > 0 ? ` ${missing} more ${missing === 1 ? 'has' : 'have'} no fee entered yet.` : ''}`,
    })
  else if (input.securities > 0)
    items.push({
      key: 'fees',
      status: 'info',
      title: 'Fees aren’t known yet',
      detail: 'Add each fund’s yearly fee on its page and the check-up will compare them.',
    })

  // Home bias: a lot of the stock side in the local market.
  if (stocks > 0) {
    const local = ((input.byClass.local_stocks ?? 0) / stocks) * 100
    items.push(
      local > 50
        ? {
            key: 'home',
            status: 'nudge',
            title: 'Mostly local stocks',
            detail: `${pct(local)} of your stocks are local. The local market is a small slice of the world’s; a global index fund spreads the same money across thousands of companies.`,
            numbers: { local },
          }
        : {
            key: 'home',
            status: 'ok',
            title: 'Spread across markets',
            detail: `${pct(100 - local)} of your stocks are global.`,
            numbers: { local },
          },
    )
  }

  // Emergency fund.
  const months = input.settings.emergencyMonths
  if (months > 0) {
    if (input.monthlySpendMinor === null || input.monthlySpendMinor <= 0)
      items.push({
        key: 'emergency',
        status: 'info',
        title: 'Emergency fund',
        detail: `Keeping ${months} months of spending somewhere safe comes before investing more. Import a few months of statements and this estimates the amount.`,
      })
    else {
      const goal = input.monthlySpendMinor * months
      items.push({
        key: 'emergency',
        status: input.cashMinor >= goal ? 'ok' : 'info',
        title: input.cashMinor >= goal ? 'Emergency fund covered' : 'Emergency fund',
        detail:
          input.cashMinor >= goal
            ? `Cash in your investment accounts covers about ${months} months of spending.`
            : `${months} months of spending is about the amount shown. Cash in a bank account counts too; this only sees cash in investment accounts.`,
        numbers: { goal, cash: input.cashMinor },
      })
    }
  }

  // Steady deposits.
  const last = input.depositDays[0]
  if (!last)
    items.push({
      key: 'deposits',
      status: 'info',
      title: 'Steady deposits',
      detail:
        'Putting in a fixed amount every month, whatever the market does, is the heart of passive investing. Record deposits under Money in and out on each account.',
    })
  else {
    const gap = daysBetween(last, input.today)
    items.push(
      gap <= DEPOSIT_GAP_DAYS
        ? {
            key: 'deposits',
            status: 'ok',
            title: 'Deposits are steady',
            detail: `Last deposit ${gap === 0 ? 'today' : gap === 1 ? 'yesterday' : `${gap} days ago`}.`,
            numbers: { gap },
          }
        : {
            key: 'deposits',
            status: 'nudge',
            title: 'No deposit for a while',
            detail: `The last deposit was ${gap} days ago. A standing monthly transfer keeps it going without having to think about it.`,
            numbers: { gap },
          },
    )
  }
  return items
}
