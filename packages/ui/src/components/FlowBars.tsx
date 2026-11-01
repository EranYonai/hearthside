import { formatMoney, type Minor } from '@hearthside/core'
import { cx } from '../cx'

export interface FlowMonth {
  /** YYYY-MM. */
  month: string
  /** Short label under the pair, e.g. "Oct". */
  label: string
  /** Money in, minor units. */
  received: Minor
  /** Spending, minor units. Sign is ignored. */
  spent: Minor
  href?: string
}

/** Money in next to money out for each month, on one shared scale. */
export function FlowBars({
  months,
  label,
  currency,
}: {
  months: FlowMonth[]
  label: string
  currency?: string
}) {
  const top = Math.max(...months.flatMap((m) => [m.received, Math.abs(m.spent)]), 1)
  const height = (v: number) => `${v > 0 ? Math.max((v / top) * 100, 3) : 0}%`
  const money = (v: number) => formatMoney(v, { currency, whole: true })
  return (
    <figure aria-label={label} className="grid gap-2">
      <ol className="grid h-40 auto-cols-fr grid-flow-col items-end gap-1 sm:gap-2">
        {months.map((m) => {
          const spent = Math.abs(m.spent)
          const text = `${m.label}: in ${money(m.received)}, out ${money(spent)}, left ${money(m.received - spent)}`
          const body = (
            <span className="flex h-full w-full items-end justify-center gap-px" aria-hidden>
              <span
                data-in={m.month}
                className="block w-1/2 max-w-4 rounded-t-sm bg-positive"
                style={{ height: height(m.received) }}
              />
              <span
                data-out={m.month}
                className="block w-1/2 max-w-4 rounded-t-sm bg-chart-1"
                style={{ height: height(spent) }}
              />
            </span>
          )
          const cls = 'flex h-full min-w-0 rounded-sm'
          return (
            <li key={m.month} className="h-full min-w-0">
              {m.href ? (
                <a
                  href={m.href}
                  aria-label={text}
                  className={cx(cls, 'focus-visible:outline-2 focus-visible:outline-focus')}
                >
                  {body}
                </a>
              ) : (
                <div className={cls} role="img" aria-label={text}>
                  {body}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <ol className="grid auto-cols-fr grid-flow-col gap-1 sm:gap-2" aria-hidden>
        {months.map((m) => (
          <li key={m.month} className="truncate text-center text-caption text-ink-muted">
            {m.label}
          </li>
        ))}
      </ol>
      <figcaption className="flex gap-4 text-caption text-ink-muted">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-pill bg-positive" aria-hidden />
          Money in
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-pill bg-chart-1" aria-hidden />
          Spent
        </span>
      </figcaption>
    </figure>
  )
}
