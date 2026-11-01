import { Logo } from '@hearthside/ui'
import { FileUp, House, ReceiptText, Settings, TrendingUp, Wallet } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, Suspense } from 'react'
import { VersionTag } from '@/lib/VersionTag'
import { BackLink, TabLink } from './BackLink'

// Five tabs with short labels fit side by side from a 320px screen up. Import lives in the header.
const NAV = [
  { href: '/', label: 'Home', icon: House },
  { href: '/invest', label: 'Invest', icon: TrendingUp },
  { href: '/transactions', label: 'Activity', icon: ReceiptText },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/settings', label: 'Settings', icon: Settings },
]

/**
 * Where a page's back button goes when there's no trail to follow (opened from a link, or after
 * a restart). With a trail it returns to the page you came from. `optional` (the default, for the
 * tabs) shows the button only when there is a trail, i.e. the page was opened from another page
 * rather than from the tab bar.
 */
export type Back = { href: string; label: string } | 'optional'

/**
 * Signed-in layout: a header that stays put (with a back button on inner pages), content, and a
 * bottom tab bar.
 */
export function AppShell({
  household,
  current,
  back = 'optional',
  children,
}: {
  household: string
  current: string
  back?: Back
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-20 border-b border-transparent bg-surface-0/85 backdrop-blur-md supports-[not(backdrop-filter:blur(0))]:bg-surface-0">
        <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-3 px-4 pt-2 pb-1">
          <span className="flex min-w-0 flex-1 items-center">
            <Suspense>
              <BackLink {...(back === 'optional' ? {} : back)} />
            </Suspense>
            {back === 'optional' && <HomeMark household={household} />}
          </span>
          {back === 'optional' ? (
            <Link
              href="/import"
              aria-current={current === '/import' ? 'page' : undefined}
              className="-me-2 flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-body-strong text-ink-muted transition-opacity active:opacity-60 aria-[current=page]:text-brand-ink"
            >
              <FileUp size={20} strokeWidth={2} aria-hidden />
              Import
            </Link>
          ) : null}
        </div>
      </header>
      <main className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-6 px-4 pt-3 pb-6">
        {children}
      </main>
      <footer className="pb-4 text-center">
        <VersionTag />
      </footer>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface-1/90 ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = current === href
            return (
              <li key={href} className="min-w-0">
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
          })}
        </ul>
      </nav>
    </div>
  )
}

/** The logo and household name: top-level pages show it where inner pages show "Back". */
function HomeMark({ household }: { household: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3 [[data-testid=back]~&]:hidden">
      <Logo size={32} />
      <span className="min-w-0 flex-1 truncate font-display text-heading">{household}</span>
    </span>
  )
}
