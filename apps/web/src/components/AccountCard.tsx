import { accountLook } from '@hearthside/core'
import { cx } from '@hearthside/ui'
import { CreditCard, Landmark, Wallet } from 'lucide-react'
import type { CSSProperties } from 'react'

const NETWORK_LABEL: Record<string, string> = {
  visa: 'VISA',
  mastercard: 'Mastercard',
  amex: 'AMEX',
  diners: 'Diners',
  isracard: 'Isracard',
}

export interface AccountCardProps {
  name: string
  kind: 'card' | 'bank' | 'other'
  /** Provider id (see PROVIDERS in core). */
  provider?: string | null
  /** The person's own color; overrides the provider's. */
  color?: string | null
  network?: string | null
  last4?: string | null
  /** Small caption under the card, e.g. "Only you" or "New account". */
  note?: string
  className?: string
}

/** The provider's initials on its color, or the account's initials when it has none. */
export function AccountMark({
  name,
  provider,
  color,
  size = 'md',
  onColor = false,
  className,
}: Pick<AccountCardProps, 'name' | 'provider' | 'color' | 'className'> & {
  size?: 'sm' | 'md'
  /** Sits on a painted card: a glassy badge in the card's own ink. */
  onColor?: boolean
}) {
  const look = accountLook({ name, provider, color })
  const filled = look.color !== null && !onColor
  return (
    <span
      aria-hidden
      className={cx(
        'grid flex-none place-items-center rounded-md font-display font-bold leading-none tracking-tight',
        size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-[12px]',
        onColor
          ? 'bg-white/20 text-current ring-1 ring-current/25'
          : !filled && 'bg-surface-1 text-ink-muted',
        className,
      )}
      style={filled ? { background: look.color!, color: look.ink! } : undefined}
      data-testid="account-mark"
    >
      {look.mono}
    </span>
  )
}

/**
 * A small card-shaped tile. Cards wear their provider's color like the plastic does; bank
 * accounts get a colored stripe and badge on a calm surface. No logos, only colors and initials.
 */
export function AccountCard({
  name,
  kind,
  provider,
  color,
  network,
  last4,
  note,
  className,
}: AccountCardProps) {
  const look = accountLook({ name, provider, color })
  const Icon = kind === 'card' ? CreditCard : kind === 'bank' ? Landmark : Wallet
  const painted = kind === 'card' && look.color !== null
  const striped = kind !== 'card' && look.color !== null

  const style: CSSProperties | undefined = painted
    ? {
        background: `radial-gradient(120% 90% at 100% 0%, ${look.accent}55, transparent 60%), linear-gradient(135deg, ${look.color}, ${look.deep})`,
        color: look.ink!,
      }
    : undefined
  const muted = painted ? 'opacity-80' : 'text-ink-muted'

  return (
    <div
      className={cx(
        'relative grid aspect-[1.586] min-w-0 grid-cols-1 content-between overflow-hidden rounded-lg p-3 shadow-card',
        !painted && 'border border-line text-ink',
        !painted &&
          (kind === 'card'
            ? 'bg-[linear-gradient(135deg,var(--hs-brand-soft),var(--hs-surface-2))]'
            : 'bg-[linear-gradient(135deg,var(--hs-surface-2),var(--hs-surface-1))]'),
        striped && 'ps-4',
        className,
      )}
      style={style}
      data-testid="account-card"
      data-brand={look.color ?? undefined}
    >
      {striped && (
        <span
          aria-hidden
          className="absolute inset-y-0 start-0 w-1.5"
          style={{ background: look.color! }}
        />
      )}
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <AccountMark name={name} provider={provider} color={color} onColor={painted} />
          <span className="truncate text-body-strong">{look.label ?? name}</span>
        </span>
        <Icon size={20} aria-hidden className={cx('flex-none', muted)} />
      </div>
      <div className="grid min-w-0 gap-0.5">
        <span
          className="font-display text-amount tracking-widest tabular-nums"
          aria-label={last4 ? `ending ${last4}` : undefined}
        >
          {last4 ? `•••• ${last4}` : ' '}
        </span>
        <span className={cx('flex items-baseline justify-between gap-2 text-caption', muted)}>
          <span className="min-w-0 truncate">
            {look.label ? name : kind === 'bank' ? 'Current account' : 'Card'}
          </span>
          {network && (
            <span className="flex-none font-display font-semibold">
              {NETWORK_LABEL[network] ?? network}
            </span>
          )}
        </span>
      </div>
      {note && (
        <span className="absolute end-2 top-11 rounded-pill bg-surface-1 px-2 text-[11px]/5 font-semibold text-brand-ink">
          {note}
        </span>
      )}
    </div>
  )
}
