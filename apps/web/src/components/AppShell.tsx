import { Logo } from '@hearthside/ui'
import { FileUp, House, ReceiptText, Settings, Wallet } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { VersionTag } from '@/lib/VersionTag'

const NAV = [
  { href: '/', label: 'Home', icon: House },
  { href: '/transactions', label: 'Transactions', icon: ReceiptText },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/import', label: 'Import', icon: FileUp },
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
        <span className="font-display text-heading">{household}</span>
      </header>
      <main className="mx-auto grid max-w-3xl gap-6 px-4 py-6">{children}</main>
      <footer className="pb-4 text-center">
        <VersionTag />
      </footer>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 border-t border-line bg-surface-1 pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-3xl justify-around">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = current === href
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-14 min-w-16 flex-col items-center justify-center gap-0.5 text-caption ${active ? 'text-brand-ink' : 'text-ink-muted'}`}
                >
                  <Icon size={24} strokeWidth={2} aria-hidden />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
