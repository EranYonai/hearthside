import type { HTMLAttributes } from 'react'
import { cx } from '../cx'

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cx(
        'grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-line bg-surface-1 p-4 shadow-card',
        className,
      )}
      {...rest}
    />
  )
}

export function Label({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx('font-body text-label text-ink-muted uppercase', className)} {...rest} />
  )
}
