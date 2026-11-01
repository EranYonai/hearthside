'use client'

import { Building2, FileUp, HandCoins, Plus, TrendingUp, Wallet, X } from 'lucide-react'
import Link from 'next/link'
import { useRef } from 'react'

const ACTIONS = [
  {
    href: '/import',
    icon: FileUp,
    label: 'Import a file',
    hint: 'A statement or a holdings file',
  },
  {
    href: '/accounts?add=1',
    icon: Wallet,
    label: 'Add an account',
    hint: 'A bank account or card, by hand',
  },
  {
    href: '/invest?add=account',
    icon: TrendingUp,
    label: 'Add an investment account',
    hint: 'Then its holdings',
  },
  { href: '/invest?add=property', icon: Building2, label: 'Add a property' },
  { href: '/invest?add=loan', icon: HandCoins, label: 'Add a loan' },
]

/** The middle of the tab bar: one place to bring things in. */
export function AddSheet({ mayAdd }: { mayAdd: boolean }) {
  const sheet = useRef<HTMLDialogElement>(null)
  const close = () => sheet.current?.close()

  return (
    <>
      <button
        type="button"
        aria-label="Add"
        aria-haspopup="dialog"
        onClick={() => sheet.current?.showModal()}
        className="grid size-12 -translate-y-2 place-items-center rounded-lg bg-brand text-on-brand shadow-card transition-[scale] duration-150 ease-out active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
      >
        <Plus size={26} strokeWidth={2.5} aria-hidden />
      </button>
      <dialog
        ref={sheet}
        aria-labelledby="add-sheet-title"
        onClick={(e) => {
          // A tap on the dimmed backdrop closes the sheet.
          if (e.target === e.currentTarget) close()
        }}
        className="add-sheet fixed inset-x-0 top-auto bottom-0 m-0 mx-auto w-full max-w-lg rounded-t-xl border border-b-0 border-line bg-surface-1 p-0 text-ink shadow-sheet backdrop:bg-black/40"
      >
        <div className="grid gap-2 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <span aria-hidden className="mx-auto h-1 w-10 rounded-pill bg-line" />
          <div className="flex items-center justify-between">
            <h2 id="add-sheet-title" className="font-display text-heading">
              Add
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="-me-2 grid size-11 place-items-center rounded-pill text-ink-muted active:bg-surface-2"
            >
              <X size={22} aria-hidden />
            </button>
          </div>
          {mayAdd ? (
            <ul className="-mx-2 grid">
              {ACTIONS.map(({ href, icon: Icon, label, hint }, i) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={close}
                    className="flex min-h-14 items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <span
                      aria-hidden
                      className={`grid size-10 shrink-0 place-items-center rounded-pill ${i === 0 ? 'bg-brand text-on-brand' : 'bg-surface-2 text-ink'}`}
                    >
                      <Icon size={20} strokeWidth={2} />
                    </span>
                    <span className="grid min-w-0">
                      <span className="text-body-strong">{label}</span>
                      {hint && <span className="text-caption text-ink-muted">{hint}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pb-2 text-ink-muted">
              Viewers can see everything but can’t add or import. Ask the owner to change your role.
            </p>
          )}
        </div>
      </dialog>
    </>
  )
}
