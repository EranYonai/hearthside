import { Card, Label, buttonClasses } from '@hearthside/ui'
import { ArrowLeft, ArrowRight, CircleCheck, CircleDashed } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { AccountCard } from '@/components/AccountCard'
import { AddPasskeyButton } from '@/components/AddPasskeyButton'
import { AuthShell } from '@/components/AuthShell'
import { requireDb } from '@/lib/db'
import {
  STEP_TITLE,
  nextStep,
  previousStep,
  resolveStep,
  stepsFor,
  type Step,
} from '@/lib/onboarding'
import { listAccounts } from '@/server/ledger'
import { listMembers, listPasskeys } from '@/server/repo'
import { requireSession } from '@/server/session'
import { AccountForm, ImportForm } from '../import/client'
import { InviteCreator } from '../settings/client'
import { FinishButton, ProfileForm } from './client'
import { listBrandLogos } from '@/server/logos'

export const metadata: Metadata = { title: 'Welcome · Hearthside' }
export const dynamic = 'force-dynamic'

const LEAD: Record<Step, string> = {
  profile: 'A few quick steps to make Hearthside yours. You can skip any of them.',
  accounts:
    'Drop in a statement from each card and account you use. Hearthside recognises the account and adds it for you.',
  invite: 'Hearthside works for one person or a whole family. Invite others now or later.',
  done: 'You can change all of this later in Settings.',
}

const href = (step: Step) => `/welcome?step=${step}`

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string | string[] }>
}) {
  const { member, household } = await requireSession()
  const steps = stepsFor(member.role)
  const step = resolveStep(steps, (await searchParams).step)
  const next = href(nextStep(steps, step))
  const back = previousStep(steps, step)
  const db = requireDb()

  let body: ReactNode
  if (step === 'profile') {
    body = (
      <Card>
        <ProfileForm
          name={member.name}
          displayCurrency={member.displayCurrency}
          {...(member.role === 'owner' ? { householdName: household.name } : {})}
          next={next}
        />
      </Card>
    )
  } else if (step === 'accounts') {
    const [all, people, logos] = await Promise.all([
      listAccounts(db, member),
      listMembers(db, household.id),
      listBrandLogos(db, household.id),
    ])
    const mine = all.filter((a) => a.ownerId === member.id)
    body = (
      <>
        <Card aria-labelledby="import-title">
          <Label id="import-title">Import a statement</Label>
          <ImportForm
            accounts={mine.map(({ id, name, kind }) => ({ id, name, kind }))}
            people={people
              .filter((p) => p.role !== 'viewer')
              .map((p) => ({ id: p.id, name: p.id === member.id ? `${p.name} (you)` : p.name }))}
            me={member.id}
          />
        </Card>
        <Card aria-labelledby="accounts-title">
          <Label id="accounts-title">Your accounts</Label>
          {mine.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3" data-testid="account-list">
              {mine.map((a) => (
                <li key={a.id}>
                  <AccountCard
                    name={a.name}
                    kind={a.kind}
                    provider={a.provider}
                    logos={logos}
                    color={a.color}
                    network={a.network}
                    last4={a.last4}
                    {...(a.visibility === 'private' ? { note: 'Only you' } : {})}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-muted">
              None yet. Import a statement and its account is added for you.
            </p>
          )}
          <details>
            <summary className="cursor-pointer text-body-strong text-brand-ink">
              Add an account by hand
            </summary>
            <div className="pt-3">
              <AccountForm />
            </div>
          </details>
        </Card>
        <Link href={next} className={buttonClasses('primary')}>
          <ArrowRight aria-hidden />
          {mine.length > 0 ? 'Continue' : 'Skip for now'}
        </Link>
      </>
    )
  } else if (step === 'invite') {
    const people = await listMembers(db, household.id)
    body = (
      <>
        <Card aria-labelledby="invite-title">
          <Label id="invite-title">Who else lives here?</Label>
          <p>
            {people.length === 1
              ? 'Just you for now.'
              : `${people.map((p) => p.name).join(', ')} already share this home.`}{' '}
            Each invite link works once, for one person, and lasts a few days.
          </p>
          <InviteCreator />
        </Card>
        <Link href={next} className={buttonClasses('primary')}>
          <ArrowRight aria-hidden />
          {people.length === 1 ? 'Just me for now' : 'Continue'}
        </Link>
      </>
    )
  } else {
    const [keys, accounts] = await Promise.all([
      listPasskeys(db, member.id),
      listAccounts(db, member),
    ])
    const ownAccounts = accounts.filter((a) => a.ownerId === member.id).length
    const items: [boolean, string][] = [
      [true, 'Passkey and recovery codes'],
      [keys.length > 1, keys.length > 1 ? `${keys.length} passkeys` : 'A second passkey'],
    ]
    if (member.role !== 'viewer')
      items.push([
        ownAccounts > 0,
        ownAccounts > 0
          ? `${ownAccounts} account${ownAccounts === 1 ? '' : 's'} added`
          : 'Your accounts',
      ])
    body = (
      <>
        <Card aria-labelledby="summary-title">
          <Label id="summary-title">Your setup</Label>
          <ul className="grid gap-2" data-testid="welcome-summary">
            {items.map(([done, text]) => (
              <li key={text} className="flex items-center gap-2">
                {done ? (
                  <CircleCheck className="text-positive" aria-label="Done" />
                ) : (
                  <CircleDashed className="text-ink-muted" aria-label="Not yet" />
                )}
                {text}
              </li>
            ))}
          </ul>
          {keys.length < 2 && (
            <>
              <p className="text-caption text-ink-muted">
                A second passkey, on another device, keeps you in if you lose this one.
              </p>
              <AddPasskeyButton />
            </>
          )}
        </Card>
        <FinishButton />
      </>
    )
  }

  const index = steps.indexOf(step)
  return (
    <AuthShell
      title={step === 'profile' ? `Welcome, ${member.name}` : STEP_TITLE[step]}
      lead={LEAD[step]}
    >
      <nav aria-label="Welcome steps" className="grid gap-2">
        <p className="text-center text-caption text-ink-muted">
          Step {index + 1} of {steps.length}
        </p>
        <ol className="flex gap-1">
          {steps.map((s, i) => (
            <li
              key={s}
              aria-current={s === step ? 'step' : undefined}
              aria-label={STEP_TITLE[s]}
              className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-brand' : 'bg-line'}`}
            />
          ))}
        </ol>
      </nav>
      {body}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {back ? (
          <Link href={href(back)} className={buttonClasses('ghost')}>
            <ArrowLeft aria-hidden />
            Back
          </Link>
        ) : (
          <span />
        )}
        {step !== 'done' && <FinishButton label="Skip the rest" variant="ghost" />}
      </div>
    </AuthShell>
  )
}
