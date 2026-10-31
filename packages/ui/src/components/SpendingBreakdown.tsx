'use client'

import { ChartColumn, ChartPie } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { cx } from '../cx'
import { DonutChart, type DonutSlice } from './DonutChart'
import { MonthBars, type MonthBar } from './MonthBars'

type View = 'categories' | 'months'

/** Two views of one month's spending: a category donut, or the last months side by side. */
export function SpendingBreakdown({
  slices,
  months,
  center,
  currency,
}: {
  slices: DonutSlice[]
  months: MonthBar[]
  center?: ReactNode
  currency?: string
}) {
  const [view, setView] = useState<View>('categories')
  const id = useId()
  const tabs = [
    { value: 'categories' as const, label: 'Categories', Icon: ChartPie },
    { value: 'months' as const, label: 'Months', Icon: ChartColumn },
  ]
  return (
    <div className="grid min-w-0 gap-3">
      <div
        role="tablist"
        aria-label="Spending view"
        className="flex gap-1 rounded-md bg-surface-2 p-1"
      >
        {tabs.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${id}-${value}-tab`}
            aria-controls={`${id}-${value}`}
            aria-selected={view === value}
            onClick={() => setView(value)}
            className={cx(
              'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm px-2 text-body-strong',
              view === value ? 'bg-surface-1 text-ink shadow-card' : 'text-ink-muted',
            )}
          >
            <Icon size={16} aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div
        className="min-w-0"
        role="tabpanel"
        id={`${id}-${view}`}
        aria-labelledby={`${id}-${view}-tab`}
      >
        {view === 'categories' ? (
          slices.length > 0 ? (
            <DonutChart
              slices={slices}
              label="Spending by category"
              center={center}
              otherName="Other categories"
              currency={currency}
            />
          ) : (
            <p className="text-ink-muted">No spending this month.</p>
          )
        ) : (
          <MonthBars months={months} label="Spending by month" currency={currency} />
        )}
      </div>
    </div>
  )
}
