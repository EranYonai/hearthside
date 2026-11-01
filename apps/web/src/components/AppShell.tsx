import { House, ReceiptText, TrendingUp, Wallet } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, Suspense } from 'react'
import { VersionTag } from '@/lib/VersionTag'
import { canEdit } from '@/server/ledger'
import { currentSession } from '@/server/session'
import { AddSheet } from './AddSheet'
import { BackLink, TabLink } from './BackLink'

// Four tabs around the Add button in the middle. Settings sits behind your initial at the top.
const LEFT = [
  { href: '/', label: 'Home', icon: House },
  { href: '/invest', label: 'Invest', icon: TrendingUp },
]
const RIGHT = [
  { href: '/transactions', label: 'Activity', icon: ReceiptText },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
]

/**
 * Where a page's back button goes when there's no trail to follow (opened from a link, or after
 * a restart). With a trail it returns to the page you came from. `optional` (the default, for the
 * tabs) shows the button only when there is a trail, i.e. the page was opened from another page
 * rather than from the tab bar.
 */
export type Back = { href: string; label: string } | 'optional'

/**
 * Signed-in layout: a slim header (back on the left, your initial for Settings on the right),
 * content, and a bottom bar of four tabs around an Add button.
 */
export async function AppShell({
  current,
  back = 'optional',
  children,
}: {
  /** Kept for callers; the household's name now shows on Home. */
  household?: string
  current: string
  back?: Back
  children: ReactNode
}) {
  const session = await currentSession()
  const name = session?.member.name ?? ''
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?'
  const mayAdd = session ? canEdit(session.member) : false
  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-20 bg-surface-0/85 backdrop-blur-md supports-[not(backdrop-filter:blur(0))]:bg-surface-0">
        <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-3 px-4 pt-2 pb-1">
          <span className="flex min-w-0 flex-1 items-center">
            <Suspense>
              <BackLink {...(back === 'optional' ? {} : back)} />
            </Suspense>
          </span>
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={current === '/settings' ? 'page' : undefined}
            className="-me-1 grid size-11 shrink-0 place-items-center rounded-pill transition-opacity active:opacity-60"
          >
            <span
              aria-hidden
              className={`grid size-9 place-items-center rounded-pill border font-display text-body-strong ${current === '/settings' ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line bg-surface-1 text-ink-muted'}`}
            >
              {initial}
            </span>
          </Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-6 px-4 pt-1 pb-6">
        {children}
      </main>
      <footer className="pb-4 text-center">
        <VersionTag />
      </footer>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface-1/90 ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-5 items-center">
          {LEFT.map((t) => (
            <Tab key={t.href} {...t} active={current === t.href} />
          ))}
          <li className="grid place-items-center">
            <AddSheet mayAdd={mayAdd} />
          </li>
          {RIGHT.map((t) => (
            <Tab key={t.href} {...t} active={current === t.href} />
          ))}
        </ul>
      </nav>
    </div>
  )
}

function Tab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: typeof House
  active: boolean
}) {
  return (
    <li className="min-w-0">
      <TabLink
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`group flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-caption transition-colors ${active ? 'font-semibold text-brand-ink' : 'text-ink-muted'}`}
      >
        <span
          className={`flex h-7 w-12 items-center justify-center rounded-pill transition-colors group-active:bg-surface-2 ${active ? 'bg-brand-soft' : ''}`}
        >
          <Icon size={22} strokeWidth={2} aria-hidden />
        </span>
        <span className="max-w-full truncate">{label}</span>
      </TabLink>
    </li>
  )
}
