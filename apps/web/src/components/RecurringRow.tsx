'use client'

import { X } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState, type ReactNode } from 'react'
import { dismissRecurringAction } from '@/app/recurring/actions'
import { useAction } from '@/lib/use-action'

const OPEN = 128

/**
 * A fixed cost that opens its entries in Activity. Swipe it left (or use the × on a computer)
 * to say it isn't a fixed cost; `restore` rows put one back instead.
 */
export function RecurringRow({
  payeeKey,
  href,
  name,
  editable,
  restore = false,
  children,
}: {
  payeeKey: string
  href: string
  name: string
  editable: boolean
  restore?: boolean
  children: ReactNode
}) {
  const { pending, error, run } = useAction()
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; base: number } | null>(null)
  const moved = useRef(false)
  const act = () => run(() => dismissRecurringAction(payeeKey, restore))
  const label = restore ? `Put ${name} back on fixed costs` : `${name} isn't a fixed cost`

  return (
    <li className="relative overflow-hidden rounded-md" data-payee>
      {editable && !restore && (
        <button
          type="button"
          onClick={act}
          disabled={pending}
          tabIndex={dx ? 0 : -1}
          aria-hidden={dx ? undefined : true}
          className="absolute inset-y-0 right-0 flex items-center bg-warning-soft px-3 text-caption font-semibold text-warning"
          style={{ width: OPEN }}
        >
          Not a fixed cost
        </button>
      )}
      <div
        className="relative flex items-center bg-surface-1 transition-transform duration-150"
        style={{ transform: `translateX(${dx}px)` }}
        onTouchStart={(e) => {
          if (!editable || restore) return
          const t = e.touches[0]!
          start.current = { x: t.clientX, y: t.clientY, base: dx }
          moved.current = false
        }}
        onTouchMove={(e) => {
          const s = start.current
          if (!s) return
          const t = e.touches[0]!
          const x = t.clientX - s.x
          if (!moved.current && Math.abs(t.clientY - s.y) > Math.abs(x)) {
            start.current = null
            return
          }
          if (Math.abs(x) > 8) moved.current = true
          setDx(Math.max(-OPEN, Math.min(0, s.base + x)))
        }}
        onTouchEnd={() => {
          if (!start.current) return
          start.current = null
          setDx((d) => (d < -OPEN / 2 ? -OPEN : 0))
        }}
      >
        <Link
          href={href}
          onClick={(e) => {
            if (moved.current || dx) {
              e.preventDefault()
              moved.current = false
              setDx(0)
            }
          }}
          className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          {children}
        </Link>
        {editable && (
          <button
            type="button"
            onClick={act}
            disabled={pending}
            aria-label={label}
            title={restore ? 'Put back' : 'Not a fixed cost'}
            className={
              restore
                ? 'ml-1 rounded-sm px-2 py-1 text-caption font-semibold text-brand-ink underline'
                : 'ml-1 hidden size-8 flex-none place-items-center rounded-pill text-ink-muted hover:bg-surface-2 focus-visible:grid focus-visible:outline-2 focus-visible:outline-focus [@media(hover:hover)]:grid'
            }
          >
            {restore ? 'Put back' : <X size={16} aria-hidden />}
          </button>
        )}
      </div>
      {error && <p className="px-2 text-caption text-negative">{error}</p>}
    </li>
  )
}
