'use client'

import type { BudgetLimit } from '@hearthside/core'
import { Button, Notice } from '@hearthside/ui'
import { Pencil } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useAction } from '@/lib/use-action'
import { addBudgetsAction, setBudgetAction } from './actions'

const inputClass =
  'min-h-11 w-full min-w-0 rounded-md border border-line bg-surface-2 px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

const major = (minor: number) => String(Math.round(minor / 100))

/** A budget row that opens into a small form to change or remove its limit. */
export function BudgetRow({
  category,
  label,
  limitMinor,
  editable,
  children,
}: {
  category: string
  label: string
  limitMinor: number
  editable: boolean
  children: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(major(limitMinor))
  const { pending, error, run } = useAction()
  const save = (value: string) =>
    run(
      () => setBudgetAction(category, value),
      () => setEditing(false),
    )
  return (
    <li className="grid gap-2 py-2" data-testid="budget-line" data-category={category}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">{children}</div>
        {editable && !editing && (
          <button
            type="button"
            onClick={() => {
              setAmount(major(limitMinor))
              setEditing(true)
            }}
            aria-label={`Change the ${label} budget`}
            className="grid size-11 place-items-center rounded-md text-ink-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Pencil size={16} aria-hidden />
          </button>
        )}
      </div>
      {editing && (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save(amount)
          }}
        >
          <label className="grid gap-1">
            <span className="text-caption text-ink-muted">{label}, a month</span>
            <input
              className={inputClass}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="ms-auto text-negative"
              disabled={pending}
              onClick={() => save('')}
            >
              Remove
            </Button>
          </div>
          {error && <Notice tone="negative">{error}</Notice>}
        </form>
      )}
    </li>
  )
}

/** Pick a category and a monthly limit. */
export function AddBudget({
  options,
  suggested,
}: {
  options: { slug: string; label: string }[]
  /** Suggested limits by category, to prefill the amount. */
  suggested: Record<string, number>
}) {
  const [category, setCategory] = useState(options[0]?.slug ?? '')
  const [amount, setAmount] = useState(
    suggested[options[0]?.slug ?? ''] ? major(suggested[options[0]!.slug]!) : '',
  )
  const { pending, error, run } = useAction()
  if (!options.length) return null
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () => setBudgetAction(category, amount),
          () => setAmount(''),
        )
      }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)] gap-2">
        <label className="grid gap-1">
          <span className="text-caption text-ink-muted">Category</span>
          <select
            className={inputClass}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              const s = suggested[e.target.value]
              setAmount(s ? major(s) : '')
            }}
          >
            {options.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-caption text-ink-muted">A month</span>
          <input
            className={inputClass}
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
      </div>
      <Button
        type="submit"
        variant="secondary"
        className="justify-self-start"
        disabled={pending || !amount.trim()}
      >
        Add budget
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
    </form>
  )
}

/** Set every suggested limit in one go. */
export function UseSuggestions({ limits }: { limits: BudgetLimit[] }) {
  const { pending, error, run } = useAction()
  return (
    <>
      <Button
        type="button"
        className="justify-self-start"
        disabled={pending}
        onClick={() => run(() => addBudgetsAction(limits))}
      >
        Use {limits.length === 1 ? 'this limit' : `these ${limits.length} limits`}
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
    </>
  )
}
