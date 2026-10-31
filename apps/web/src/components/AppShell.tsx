import { Logo } from '@hearthside/ui'
import { FileUp, House, ReceiptText, Settings, TrendingUp, Wallet } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { VersionTag } from '@/lib/VersionTag'

// Five tabs with short labels fit side by side from a 320px screen up. Import lives in the header.
const NAV = [
  { href: '/', label: 'Home', icon: House },
  { href: '/invest', label: 'Invest', icon: TrendingUp },
  { href: '/transactions', label: 'Activity', icon: ReceiptText },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/settings', label: 'Settings', icon: Settings },
]

/** Signed-in layout: header, content, and a bottom tab bar on phones. */
export function AppShell({
  household,
  current,
  children,
}: {
  household: string
  current: string
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh pb-24">
      <header className="mx-auto flex max-w-3xl items-center gap-3 px-4 pt-6">
        <Logo size={32} />
        <span className="min-w-0 flex-1 truncate font-display text-heading">{household}</span>
        <Link
          href="/import"
          aria-current={current === '/import' ? 'page' : undefined}
          className="-me-2 flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm px-2 text-body-strong text-ink-muted aria-[current=page]:text-brand-ink"
        >
          <FileUp size={20} strokeWidth={2} aria-hidden />
          Import
        </Link>
      </header>
      <main className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6">
        {children}
      </main>
      <footer className="pb-4 text-center">
        <VersionTag />
      </footer>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 border-t border-line bg-surface-1 ps-[env(safe-area-inset-left)] pe-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = current === href
            return (
              <li key={href} className="min-w-0">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-caption ${active ? 'text-brand-ink' : 'text-ink-muted'}`}
                >
                  <Icon size={24} strokeWidth={2} aria-hidden />
                  <span className="max-w-full truncate">{label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
