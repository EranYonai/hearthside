import { formatMoney, moneyLabel, type Minor } from '@hearthside/core'
import { cx } from '../cx'

export interface AmountProps {
  /** Integer minor units (agorot). Negative is money out. */
  minor: Minor
  currency?: string
  locale?: string
  /** Whole units, for summaries. */
  whole?: boolean
  /** Show a sign and color money in as positive. */
  signed?: boolean
  /** Over budget or overdrawn. Never for ordinary spending. */
  problem?: boolean
  hero?: boolean
  /** Pending rows. */
  muted?: boolean
  /** Original amount for foreign purchases, shown as a caption. */
  original?: { minor: Minor; currency: string }
  className?: string
}

export function Amount({
  minor,
  currency = 'ILS',
  locale,
  whole = false,
  signed = false,
  problem = false,
  hero = false,
  muted = false,
  original,
  className,
}: AmountProps) {
  const text = formatMoney(minor, { currency, locale, whole, signed })
  const tone = muted
    ? 'text-ink-muted'
    : problem
      ? 'text-negative'
      : signed && minor > 0
        ? 'text-positive'
        : 'text-ink'
  return (
    <span
      aria-label={moneyLabel(minor, currency)}
      className={cx(
        'font-display whitespace-nowrap tabular-nums [unicode-bidi:isolate]',
        hero ? 'text-amount-hero' : 'text-amount',
        tone,
        className,
      )}
    >
      {text}
      {original && (
        <span className="block font-body text-caption text-ink-muted">
          {formatMoney(Math.abs(original.minor), { currency: original.currency, locale })}
        </span>
      )}
    </span>
  )
}
