import type { Minor } from '@hearthside/core'
import type { ReactNode } from 'react'
import { cx } from '../cx'
import { Amount } from './Amount'
import { CategoryIcon, type Category } from './CategoryIcon'

export interface TransactionRowProps {
  category: Category
  /** Merchant exactly as the issuer sent it (often Hebrew). */
  merchant: string
  /** category · source ·last4 · who · date */
  meta: string
  minor: Minor
  original?: { minor: Minor; currency: string }
  installment?: { n: number; total: number }
  pending?: boolean
  className?: string
}

export function TransactionRow({
  category,
  merchant,
  meta,
  minor,
  original,
  installment,
  pending = false,
  className,
}: TransactionRowProps) {
  return (
    <li
      data-pending={pending || undefined}
      className={cx('flex min-h-11 items-center gap-3 py-2', className)}
    >
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
        <span className="truncate text-caption text-ink-muted">
          {pending ? `Pending · ${meta}` : meta}
        </span>
      </div>
      <div className="text-end">
        <Amount minor={minor} signed original={original} muted={pending} />
      </div>
    </li>
  )
}

export function TransactionList({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <ul className={cx('grid divide-y divide-line', className)}>{children}</ul>
}
