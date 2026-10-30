'use client'

import { CATEGORIES, categoryLabel, type Minor } from '@hearthside/core'
import { Button, CategoryIcon, Notice, TransactionRow, type Category } from '@hearthside/ui'
import { useRef, useState } from 'react'
import { useAction } from '@/lib/use-action'
import { setCategoryAction } from './actions'

export interface TxView {
  id: string
  description: string
  meta: string
  minor: Minor
  category: string | null
  original?: { minor: Minor; currency: string }
  installment?: { n: number; total: number }
}

function rowProps(tx: TxView) {
  return {
    category: (tx.category ?? 'other') as Category,
    merchant: tx.description,
    meta: `${categoryLabel(tx.category)} · ${tx.meta}`,
    minor: tx.minor,
    ...(tx.original ? { original: tx.original } : {}),
    ...(tx.installment ? { installment: tx.installment } : {}),
  }
}

export function CategorisedRow({ tx, editable }: { tx: TxView; editable: boolean }) {
  if (!editable) return <TransactionRow {...rowProps(tx)} />
  return <EditableRow tx={tx} />
}

function EditableRow({ tx }: { tx: TxView }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [remember, setRemember] = useState(true)
  const [note, setNote] = useState<string>()
  const { pending, error, run } = useAction()

  const choose = (category: string | null) =>
    run(async () => {
      const result = await setCategoryAction(tx.id, category, remember && category !== null)
      if (result.ok) {
        dialog.current?.close()
        if (result.also > 0)
          setNote(`Also filed ${result.also} other “${tx.description}” transactions.`)
      }
      return result
    })

  return (
    <TransactionRow
      {...rowProps(tx)}
      onSelect={() => {
        setNote(undefined)
        dialog.current?.showModal()
      }}
      selectLabel={`${tx.description}, ${categoryLabel(tx.category)}. Change category`}
    >
      {note && <Notice tone="positive">{note}</Notice>}
      <dialog
        ref={dialog}
        aria-labelledby={`cat-${tx.id}`}
        className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-lg border border-line bg-surface-1 p-4 text-ink shadow-sheet backdrop:bg-black/40"
      >
        <h2 id={`cat-${tx.id}`} className="mb-3 font-display text-heading">
          Category for <bdi>{tx.description}</bdi>
        </h2>
        <ul className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                disabled={pending}
                aria-pressed={tx.category === c.slug}
                onClick={() => choose(c.slug)}
                className="flex min-h-11 w-full items-center gap-2 rounded-md border border-line px-2 text-start aria-pressed:border-brand aria-pressed:bg-brand-soft"
              >
                <CategoryIcon
                  category={c.slug}
                  active={tx.category === c.slug}
                  className="size-7"
                />
                {c.label}
              </button>
            </li>
          ))}
        </ul>
        <label className="mt-3 flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>
            Always use this for “<bdi>{tx.description}</bdi>”
          </span>
        </label>
        {error && <Notice tone="negative">{error}</Notice>}
        <div className="mt-3 flex flex-wrap gap-2">
          {tx.category && (
            <Button variant="ghost" disabled={pending} onClick={() => choose(null)}>
              Clear category
            </Button>
          )}
          <Button variant="secondary" onClick={() => dialog.current?.close()}>
            Cancel
          </Button>
        </div>
      </dialog>
    </TransactionRow>
  )
}
