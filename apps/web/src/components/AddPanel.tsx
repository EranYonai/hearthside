import { Card } from '@hearthside/ui'
import { X } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

/** A form opened from the Add sheet, shown at the top of the page it belongs to. */
export function AddPanel({
  id,
  title,
  cancelHref,
  children,
}: {
  id: string
  title: string
  cancelHref: string
  children: ReactNode
}) {
  return (
    <Card aria-labelledby={id} className="border-brand/40">
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className="font-display text-heading">
          {title}
        </h2>
        <Link
          href={cancelHref}
          replace
          scroll={false}
          aria-label="Cancel"
          className="-me-2 grid size-11 place-items-center rounded-pill text-ink-muted active:bg-surface-2"
        >
          <X size={22} aria-hidden />
        </Link>
      </div>
      {children}
    </Card>
  )
}
