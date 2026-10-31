import {
  CATEGORIES,
  CATEGORY_ICON_NAMES,
  MAX_CUSTOM_CATEGORIES,
  accountLook,
  type BrandId,
} from '@hearthside/core'
import { Card, Label, Notice } from '@hearthside/ui'
import type { Metadata } from 'next'
import { AddPasskeyButton } from '@/components/AddPasskeyButton'
import { AppShell } from '@/components/AppShell'
import { SignOutButton } from '@/components/SignOutButton'
import { ThemeToggle } from '@/lib/ThemeToggle'
import { requireDb } from '@/lib/db'
import {
  isApproved,
  listMembers,
  listOpenInvites,
  listPasskeys,
  recentAudit,
  unusedRecoveryCodeCount,
} from '@/server/repo'
import { listCustomCategories } from '@/server/categories'
import { listInvestmentAccounts } from '@/server/invest'
import { listAccounts } from '@/server/ledger'
import { listBrandLogos } from '@/server/logos'
import { requireSession } from '@/server/session'
import { ProfileForm, RestartWelcome } from '../welcome/client'
import { CategoryManager } from './categories'
import { LogoSettings } from './logos'
import {
  InviteCreator,
  MemberControls,
  PendingControls,
  RegenerateCodes,
  RemovePasskey,
  RevokeInvite,
} from './client'

export const metadata: Metadata = { title: 'Settings · Hearthside' }
export const dynamic = 'force-dynamic'

const ROLE_LABEL = { owner: 'Owner', adult: 'Adult', viewer: 'Viewer' }
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export default async function SettingsPage() {
  const { member, household } = await requireSession()
  const db = requireDb()
  const isOwner = member.role === 'owner'
  const [people, keys, codesLeft, invites, activity, custom, logos, everyday, investing] =
    await Promise.all([
      listMembers(db, household.id, { includePending: isOwner }),
      listPasskeys(db, member.id),
      unusedRecoveryCodeCount(db, member.id),
      isOwner ? listOpenInvites(db, household.id) : Promise.resolve([]),
      isOwner ? recentAudit(db, household.id, 15) : Promise.resolve([]),
      listCustomCategories(db, household.id),
      listBrandLogos(db, household.id),
      listAccounts(db, member),
      listInvestmentAccounts(db, member),
    ])
  const inUse = [
    ...new Set(
      [...everyday, ...investing]
        .map((a) => accountLook(a).brand)
        .filter((b): b is BrandId => b !== null),
    ),
  ]
  const editor = member.role !== 'viewer'
  const waiting = people.filter((p) => !isApproved(p))
  const current = people.filter(isApproved)

  return (
    <AppShell household={household.name} current="/settings">
      <h1 className="font-display text-title">Settings</h1>

      <Card aria-labelledby="you">
        <Label id="you">You</Label>
        <p>
          <span className="text-body-strong">{member.name}</span> · {ROLE_LABEL[member.role]}
        </p>
        <ProfileForm
          name={member.name}
          displayCurrency={member.displayCurrency}
          {...(isOwner ? { householdName: household.name } : {})}
          submitLabel="Save"
        />
        <div className="flex flex-wrap gap-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
        <RestartWelcome />
      </Card>

      <Card aria-labelledby="categories">
        <Label id="categories">Categories</Label>
        <p className="text-caption text-ink-muted">
          Built in: {CATEGORIES.map((c) => c.label).join(', ')}.
          {editor && ' Add your own below; automatic categorizing uses them too.'}
        </p>
        {editor ? (
          <CategoryManager
            custom={custom}
            icons={CATEGORY_ICON_NAMES}
            max={MAX_CUSTOM_CATEGORIES}
          />
        ) : (
          custom.length > 0 && <p>Yours: {custom.map((c) => c.label).join(', ')}.</p>
        )}
      </Card>

      {member.role !== 'viewer' && (
        <Card aria-labelledby="logos">
          <Label id="logos">Bank and card logos</Label>
          <p className="text-caption text-ink-muted">
            Hearthside doesn’t come with logos. Add the ones you like and they replace the initials
            on your accounts. They stay private to your home.
          </p>
          <LogoSettings inUse={inUse} logos={logos} />
        </Card>
      )}

      <Card aria-labelledby="passkeys">
        <Label id="passkeys">Passkeys</Label>
        {keys.length < 2 && (
          <Notice tone="warning">
            Add a second passkey, on another device, so losing one phone doesn’t lock you out.
          </Notice>
        )}
        <ul className="grid divide-y divide-line">
          {keys.map((k) => (
            <li key={k.id} className="flex min-h-11 items-center justify-between gap-2 py-2">
              <span>
                <span className="text-body-strong">{k.name}</span>
                <span className="block text-caption text-ink-muted">
                  Added {date.format(k.createdAt)}
                  {k.lastUsedAt ? ` · last used ${date.format(k.lastUsedAt)}` : ''}
                </span>
              </span>
              {keys.length > 1 && <RemovePasskey id={k.id} name={k.name} />}
            </li>
          ))}
        </ul>
        <AddPasskeyButton />
      </Card>

      <Card aria-labelledby="recovery">
        <Label id="recovery">Recovery codes</Label>
        <p>
          {codesLeft} of 10 unused.
          {codesLeft <= 3 && ' Make new ones soon.'}
        </p>
        <RegenerateCodes />
      </Card>

      <Card aria-labelledby="members-title" id="members">
        <Label id="members-title">Members</Label>
        {waiting.length > 0 && (
          <div className="grid gap-1" data-testid="pending-members">
            <Notice tone="warning">
              {waiting.length === 1
                ? 'Someone joined with an invite link and is waiting for you.'
                : `${waiting.length} people joined with invite links and are waiting for you.`}{' '}
              They can’t see anything until you approve them.
            </Notice>
            <ul className="grid divide-y divide-line">
              {waiting.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="text-body-strong">{p.name}</span>
                    <span className="block text-caption text-ink-muted">
                      {ROLE_LABEL[p.role]} · joined {date.format(p.createdAt)} · waiting
                    </span>
                  </span>
                  <PendingControls id={p.id} name={p.name} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <ul className="grid divide-y divide-line" data-testid="member-list">
          {current.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="text-body-strong">{p.name}</span>
                <span className="block text-caption text-ink-muted">
                  {ROLE_LABEL[p.role]}
                  {p.id === member.id ? ' · you' : ''}
                </span>
              </span>
              {isOwner && p.role !== 'owner' && (
                <MemberControls id={p.id} name={p.name} role={p.role} />
              )}
            </li>
          ))}
        </ul>
        {isOwner && (
          <>
            <InviteCreator />
            {invites.length > 0 && (
              <div className="grid gap-1">
                <span className="text-body-strong">Open invites</span>
                <ul className="grid divide-y divide-line">
                  {invites.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-center justify-between gap-2 py-1 text-caption"
                    >
                      <span>
                        {ROLE_LABEL[i.role]} · expires {date.format(i.expiresAt)}
                      </span>
                      <RevokeInvite id={i.id} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Card>

      {isOwner && (
        <Card aria-labelledby="activity">
          <Label id="activity">Recent sign-in activity</Label>
          <ul className="grid gap-1 text-caption">
            {activity.map(({ entry, memberName }) => (
              <li key={entry.id} className="flex justify-between gap-2">
                <span>
                  {entry.action}
                  {memberName ? ` · ${memberName}` : ''}
                </span>
                <time className="text-ink-muted" dateTime={entry.createdAt.toISOString()}>
                  {date.format(entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AppShell>
  )
}
