import { Logo } from '@hearthside/ui'
import { Check, ChartColumn, House, Rows3, Users } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { VersionTag } from '@/lib/VersionTag'
import { RequestInviteForm } from './RequestInviteForm'

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <Rows3 aria-hidden />,
    title: 'All in one place',
    text: 'Bring in statements from every account and card. Hearthside sorts them into categories and learns from your picks.',
  },
  {
    icon: <Users aria-hidden />,
    title: 'Shared, or just yours',
    text: 'Each person brings their own accounts and chooses what the home sees. Partners, kids, roommates: any size of home.',
  },
  {
    icon: <ChartColumn aria-hidden />,
    title: 'Trends and budgets',
    text: 'See where the money goes month by month, set gentle limits, and spot the bills that keep coming back.',
  },
  {
    icon: <House aria-hidden />,
    title: 'What you own',
    text: 'Savings, investments, property and loans in one net worth, with calm nudges instead of noise.',
  },
]

const PRIVATE = [
  'Sign in with Face ID or a fingerprint. No passwords to leak.',
  'Every home is kept apart from every other.',
  'Download an encrypted backup of your home whenever you like.',
  'No ads, and your data is never sold.',
]

const STEPS = [
  ['Get an invite', 'From a friend who uses Hearthside, or request one above.'],
  ['Create your home', 'Name it and save a passkey on your phone. It takes a minute.'],
  ['Bring in your people', 'Invite the people you live with, and friends to start their own.'],
]

const BARS = [60, 80, 70, 90, 75]

/** The public page for signed-out visitors: shows the app off and asks for an invite. */
export function Landing() {
  return (
    <div className="min-h-dvh bg-surface-0 text-ink">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-5">
        <div className="flex items-center gap-2">
          <Logo size={40} />
          <span className="font-display text-heading">Hearthside</span>
        </div>
        <nav className="flex items-center gap-2">
          <a href="#how" className="px-2 py-3 text-body-strong text-brand-ink">
            How it works
          </a>
          <Link
            href="/login"
            className="rounded-pill border border-line bg-surface-1 px-4 py-2 text-body-strong"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto flex max-w-5xl flex-wrap items-center gap-12 px-4 pt-8 pb-16">
          <div className="grid min-w-0 flex-[1_1_420px] gap-6">
            <span className="justify-self-start rounded-pill bg-brand-soft px-3 py-1 text-caption text-brand-ink">
              Invite only, for now
            </span>
            <h1 className="font-display text-[clamp(2.5rem,6vw,3.5rem)] leading-[1.05] font-semibold tracking-tight">
              One home,
              <br />
              one clear picture.
            </h1>
            <p className="max-w-xl text-[1.25rem] leading-relaxed text-ink-muted">
              All your household’s money in one calm place. Spending, bills, budgets, savings and
              what you own, shared with the people you live with and private where it should be.
            </p>
            <RequestInviteForm />
          </div>

          <figure
            className="flex min-w-0 flex-[1_1_320px] justify-center"
            aria-label="Sample home screen"
          >
            <div className="grid w-full max-w-[340px] gap-4 rounded-[32px] border border-line bg-surface-1 p-5 shadow-[0_24px_60px_rgba(59,42,26,0.12)]">
              <div className="flex items-baseline justify-between">
                <span className="text-heading">Hi Alex</span>
                <span className="text-caption text-ink-muted">October</span>
              </div>
              <div className="grid gap-1 rounded-xl bg-ink p-4 text-surface-0">
                <span className="text-caption opacity-80">Spent this month</span>
                <span className="text-amount-hero tabular-nums">₪8,240</span>
                <span className="text-caption text-ember">₪610 less than September</span>
                <div className="mt-2 flex h-16 items-end gap-2" aria-hidden>
                  {BARS.map((h, i) => (
                    <div
                      key={i}
                      className={
                        i === BARS.length - 1
                          ? 'flex-1 rounded-sm bg-brand'
                          : 'flex-1 rounded-sm bg-ink-muted'
                      }
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
              <ul className="grid divide-y divide-line">
                <li className="flex justify-between py-3">
                  <span>Groceries</span>
                  <span className="tabular-nums">₪2,150 of ₪2,500</span>
                </li>
                <li className="flex justify-between py-3">
                  <span>Bills</span>
                  <span className="tabular-nums">₪1,320</span>
                </li>
                <li className="flex justify-between py-3">
                  <span>Savings</span>
                  <span className="text-positive tabular-nums">+₪1,500</span>
                </li>
              </ul>
              <figcaption className="text-center text-caption text-ink-muted">
                Sample data
              </figcaption>
            </div>
          </figure>
        </section>

        <section className="border-y border-line bg-surface-1">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16">
            <h2 className="font-display text-title">Everything your home spends, earns and owns</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="grid content-start gap-2 rounded-xl bg-surface-0 p-6 [&_svg]:size-7 [&_svg]:text-brand-ink"
                >
                  {f.icon}
                  <h3 className="text-heading">{f.title}</h3>
                  <p className="text-ink-muted">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto flex max-w-5xl flex-wrap items-center gap-10 px-4 py-16">
          <div className="grid min-w-0 flex-[1_1_380px] gap-3">
            <h2 className="font-display text-title">Private by design</h2>
            <p className="text-ink-muted">
              Your home is yours alone. Nobody else on Hearthside can see it, and private details
              are encrypted before they’re stored.
            </p>
          </div>
          <ul className="grid min-w-0 flex-[1_1_380px] gap-3">
            {PRIVATE.map((t) => (
              <li key={t} className="flex items-start gap-3">
                <Check aria-hidden className="mt-0.5 size-5 flex-none text-positive" />
                {t}
              </li>
            ))}
          </ul>
        </section>

        <section id="how" className="bg-ink text-surface-0">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16">
            <h2 className="font-display text-title">How to get in</h2>
            <ol className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="grid content-start gap-2">
                  <span className="text-body-strong text-ember">{i + 1}</span>
                  <span className="text-heading">{title}</span>
                  <span className="opacity-80">{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 pt-10 pb-14">
        <span className="text-ink-muted">Already have a home here?</span>
        <Link
          href="/login"
          className="rounded-pill bg-brand-soft px-5 py-3 text-body-strong text-brand-ink"
        >
          Sign in with passkey
        </Link>
        <div className="basis-full text-center">
          <VersionTag />
        </div>
      </footer>
    </div>
  )
}
