import { Logo } from '@hearthside/ui'
import type { ReactNode } from 'react'
import { VersionTag } from '@/lib/VersionTag'

/** Centered single-card layout for setup, sign-in and invites. */
export function AuthShell({
  title,
  lead,
  children,
}: {
  title: string
  lead?: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-6 px-4 py-8">
      <div className="grid justify-items-center gap-3 text-center">
        <Logo size={72} />
        <h1 className="font-display text-title">{title}</h1>
        {lead && <p className="text-ink-muted">{lead}</p>}
      </div>
      {children}
      <footer className="text-center">
        <VersionTag />
      </footer>
    </main>
  )
}
