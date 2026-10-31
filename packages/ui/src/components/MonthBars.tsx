import { formatMoney, type Minor } from '@hearthside/core'
import { cx } from '../cx'

export interface MonthBar {
  /** YYYY-MM. */
  month: string
  /** Short label under the bar, e.g. "Oct". */
  label: string
  /** Spending, minor units. Sign is ignored. */
  minor: Minor
  href?: string
  /** The month on screen. */
  current?: boolean
}

/** Spending per month as columns, the current month highlighted and labelled with its amount. */
export function MonthBars({
  months,
  label,
  currency,
}: {
  months: MonthBar[]
  label: string
  currency?: string
}) {
  const top = Math.max(...months.map((m) => Math.abs(m.minor)), 1)
  return (
    <figure aria-label={label} className="grid gap-2">
      <ol className="grid h-40 auto-cols-fr grid-flow-col items-end gap-2">
        {months.map((m) => {
          const minor = Math.abs(m.minor)
          const text = formatMoney(minor, { currency, whole: true })
          const body = (
            <>
              <span
                className={cx(
                  'text-caption tabular-nums',
                  m.current ? 'text-ink' : 'text-transparent group-hover:text-ink-muted',
                )}
                aria-hidden
              >
                {text}
              </span>
              <span
                data-bar={m.month}
                className={cx(
                  'block w-full max-w-10 rounded-t-sm',
                  m.current ? 'bg-chart-1' : 'bg-chart-other/50',
                )}
                style={{ height: `${Math.max((minor / top) * 100, minor > 0 ? 3 : 1)}%` }}
                aria-hidden
              />
            </>
          )
          const cls =
            'group grid h-full min-w-0 grid-rows-[auto_1fr] items-end justify-items-center gap-1 whitespace-nowrap'
          return (
            <li key={m.month} className="h-full min-w-0">
              {m.href ? (
                <a
                  href={m.href}
                  aria-label={`${m.label}: ${text}`}
                  aria-current={m.current ? 'date' : undefined}
                  className={cx(
                    cls,
                    'rounded-sm focus-visible:outline-2 focus-visible:outline-focus',
                  )}
                >
                  {body}
                </a>
              ) : (
                <div className={cls} aria-label={`${m.label}: ${text}`}>
                  {body}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <ol className="grid auto-cols-fr grid-flow-col gap-2" aria-hidden>
        {months.map((m) => (
          <li
            key={m.month}
            className={cx('text-center text-caption', m.current ? 'text-ink' : 'text-ink-muted')}
          >
            {m.label}
          </li>
        ))}
      </ol>
    </figure>
  )
}
