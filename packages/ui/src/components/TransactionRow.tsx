import type { Minor } from '@hearthside/core'
import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from '../cx'
import { Amount } from './Amount'
import { CategoryIcon, type Category } from './CategoryIcon'

export interface TransactionRowProps {
  category: Category
  /** Merchant exactly as the issuer sent it (often Hebrew). */
  merchant: string
  /** category · source ·last4 · who · date */
  meta: string
  /** A small dot before the meta line, e.g. the account's color. */
  metaColor?: string
  minor: Minor
  original?: { minor: Minor; currency: string }
  installment?: { n: number; total: number }
  pending?: boolean
  /** Makes the row a button, e.g. to change its category. */
  onSelect?: () => void
  /** Accessible name for the button. */
  selectLabel?: string
  /** Rendered inside the row after it, e.g. a dialog or a notice. */
  children?: ReactNode
  className?: string
}

export function TransactionRow({
  category,
  merchant,
  meta,
  metaColor,
  minor,
  original,
  installment,
  pending = false,
  onSelect,
  selectLabel,
  children,
  className,
}: TransactionRowProps) {
  const body = (
    <>
      <CategoryIcon category={category} />
      <div className="grid min-w-0 flex-1">
        <span className="flex items-center gap-1 overflow-hidden text-body-strong text-ellipsis whitespace-nowrap">
          <bdi className="truncate">{merchant}</bdi>
          {installment && (
            <span className="inline-flex items-center rounded-sm bg-brand-soft px-2 py-px font-display text-[11px]/4 font-semibold text-brand-ink tabular-nums">
              {installment.n}/{installment.total}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5 text-caption text-ink-muted">
          {metaColor && (
            <span
              aria-hidden
              className="size-2 flex-none rounded-pill"
              style={{ background: metaColor }}
              data-testid="meta-color"
            />
          )}
          <span className="min-w-0 truncate">{pending ? `Pending · ${meta}` : meta}</span>
        </span>
      </div>
      <div className="text-end">
        <Amount minor={minor} signed original={original} muted={pending} />
      </div>
    </>
  )
  const row = 'flex min-h-11 items-center gap-3 py-2'
  return (
    <li
      data-pending={pending || undefined}
      className={cx(!onSelect && !children && row, className)}
    >
      {onSelect || children ? (
        onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            aria-label={selectLabel}
            className={cx(
              row,
              'w-full rounded-md text-start hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
          >
            {body}
          </button>
        ) : (
          <div className={row}>{body}</div>
        )
      ) : (
        body
      )}
      {children}
    </li>
  )
}

export function TransactionList({
  children,
  className,
  ...rest
}: { children: ReactNode } & HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className={cx('grid grid-cols-[minmax(0,1fr)] divide-y divide-line', className)} {...rest}>
      {children}
    </ul>
  )
}
