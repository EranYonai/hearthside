'use client'

import type { CategoryIconName } from '@hearthside/core'
import { Button, CategoryIcon, Notice, type Category } from '@hearthside/ui'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
  type CategoryForm,
} from './actions'

export interface CustomCategoryView {
  slug: string
  label: string
  icon: CategoryIconName
  direction: 'out' | 'in'
  keywords: readonly string[]
}

const fieldClass = 'min-h-11 w-full rounded-md border border-line bg-surface-2 px-3'

function useRun() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk?: () => void) =>
    start(async () => {
      setError(undefined)
      const r = await fn()
      if (r.ok) onOk?.()
      else setError(r.error)
    })
  return { pending, error, run }
}

function CategoryFields({
  initial,
  icons,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: CategoryForm
  icons: readonly CategoryIconName[]
  submitLabel: string
  onSubmit: (form: CategoryForm) => Promise<{ ok: true } | { ok: false; error: string }>
  onCancel?: () => void
}) {
  const [form, setForm] = useState(initial)
  const { pending, error, run } = useRun()
  const set = (patch: Partial<CategoryForm>) => setForm((f) => ({ ...f, ...patch }))
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () => onSubmit(form),
          () => (onCancel ? onCancel() : setForm(initial)),
        )
      }}
    >
      <label className="grid gap-1">
        <span className="text-caption text-ink-muted">Category name</span>
        <input
          className={fieldClass}
          value={form.label}
          maxLength={30}
          required
          onChange={(e) => set({ label: e.target.value })}
        />
      </label>
      <fieldset>
        <legend className="mb-1 text-caption text-ink-muted">Icon</legend>
        <div className="flex flex-wrap gap-1">
          {icons.map((icon) => (
            <button
              key={icon}
              type="button"
              aria-label={icon}
              aria-pressed={form.icon === icon}
              onClick={() => set({ icon })}
              className="rounded-pill p-0.5 aria-pressed:ring-2 aria-pressed:ring-brand"
            >
              <CategoryIcon category={icon as Category} active={form.icon === icon} />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-caption text-ink-muted">For</legend>
        {(
          [
            ['out', 'Money out'],
            ['in', 'Money in'],
          ] as const
        ).map(([value, text]) => (
          <label key={value} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              checked={form.direction === value}
              onChange={() => set({ direction: value })}
            />
            {text}
          </label>
        ))}
      </fieldset>
      <label className="grid gap-1">
        <span className="text-caption text-ink-muted">
          Keywords, comma separated (optional). Entries whose description contains one are filed
          here.
        </span>
        <input
          className={fieldClass}
          value={form.keywords}
          onChange={(e) => set({ keywords: e.target.value })}
        />
      </label>
      {error && <Notice tone="negative">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

function CustomRow({ c, icons }: { c: CustomCategoryView; icons: readonly CategoryIconName[] }) {
  const [editing, setEditing] = useState(false)
  const { pending, error, run } = useRun()
  if (editing)
    return (
      <li className="py-3">
        <CategoryFields
          initial={{
            label: c.label,
            icon: c.icon,
            direction: c.direction,
            keywords: c.keywords.join(', '),
          }}
          icons={icons}
          submitLabel="Save"
          onSubmit={(form) => updateCategoryAction(c.slug, form)}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  return (
    <li className="flex min-h-11 items-center gap-2 py-2">
      <CategoryIcon category={c.icon as Category} />
      <span className="grow">
        <span className="text-body-strong">{c.label}</span>
        <span className="block text-caption text-ink-muted">
          {c.direction === 'in' ? 'Money in' : 'Money out'}
          {c.keywords.length ? ` · ${c.keywords.join(', ')}` : ''}
        </span>
      </span>
      <Button variant="ghost" aria-label={`Edit ${c.label}`} onClick={() => setEditing(true)}>
        <Pencil aria-hidden />
      </Button>
      <Button
        variant="ghost"
        aria-label={`Remove ${c.label}`}
        disabled={pending}
        onClick={() => run(() => deleteCategoryAction(c.slug))}
      >
        <Trash2 aria-hidden />
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
    </li>
  )
}

/** The household's own categories: add, edit and remove. */
export function CategoryManager({
  custom,
  icons,
  max,
}: {
  custom: readonly CustomCategoryView[]
  icons: readonly CategoryIconName[]
  max: number
}) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="grid gap-3">
      {custom.length > 0 && (
        <ul className="grid divide-y divide-line" data-testid="custom-categories">
          {custom.map((c) => (
            <CustomRow key={c.slug} c={c} icons={icons} />
          ))}
        </ul>
      )}
      {adding ? (
        <CategoryFields
          initial={{ label: '', icon: 'other', direction: 'out', keywords: '' }}
          icons={icons}
          submitLabel="Add category"
          onSubmit={createCategoryAction}
          onCancel={() => setAdding(false)}
        />
      ) : (
        custom.length < max && (
          <Button
            variant="secondary"
            icon={<Plus aria-hidden />}
            className="justify-self-start"
            onClick={() => setAdding(true)}
          >
            New category
          </Button>
        )
      )}
    </div>
  )
}
