import { cx } from '@hearthside/ui'
import { CreditCard, Landmark, TrendingUp, Wallet } from 'lucide-react'

const NETWORK_LABEL: Record<string, string> = {
  visa: 'VISA',
  mastercard: 'Mastercard',
  amex: 'AMEX',
  diners: 'Diners',
  isracard: 'Isracard',
}

const FALLBACK_NAME: Record<string, string> = {
  bank: 'Current account',
  investment: 'Investments',
}

export interface AccountCardProps {
  name: string
  kind: 'card' | 'bank' | 'investment' | 'other'
  provider?: string | null
  network?: string | null
  last4?: string | null
  /** Small caption under the card, e.g. "Only you" or "New account". */
  note?: string
  className?: string
}

/** A small card-shaped tile: provider, network and the last four digits. */
export function AccountCard({
  name,
  kind,
  provider,
  network,
  last4,
  note,
  className,
}: AccountCardProps) {
  const Icon =
    kind === 'card'
      ? CreditCard
      : kind === 'bank'
        ? Landmark
        : kind === 'investment'
          ? TrendingUp
          : Wallet
  return (
    <div
      className={cx(
        'relative grid aspect-[1.586] min-w-0 content-between overflow-hidden rounded-lg p-3 text-ink shadow-card',
        kind === 'card'
          ? 'bg-[linear-gradient(135deg,var(--hs-brand-soft),var(--hs-surface-2))]'
          : 'bg-[linear-gradient(135deg,var(--hs-surface-2),var(--hs-surface-1))]',
        'border border-line',
        className,
      )}
      data-testid="account-card"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-body-strong">{provider ?? name}</span>
        <Icon size={20} aria-hidden className="flex-none text-ink-muted" />
      </div>
      <div className="grid gap-0.5">
        <span
          className="font-display text-amount tracking-widest tabular-nums"
          aria-label={last4 ? `ending ${last4}` : undefined}
        >
          {last4 ? `•••• ${last4}` : ' '}
        </span>
        <span className="flex items-baseline justify-between gap-2 text-caption text-ink-muted">
          <span className="truncate">{provider ? name : (FALLBACK_NAME[kind] ?? 'Card')}</span>
          {network && (
            <span className="font-display font-semibold">{NETWORK_LABEL[network] ?? network}</span>
          )}
        </span>
      </div>
      {note && (
        <span className="absolute end-2 top-9 rounded-pill bg-surface-1 px-2 text-[11px]/5 font-semibold text-brand-ink">
          {note}
        </span>
      )}
    </div>
  )
}
