import { CATEGORIES, CATEGORY_ICON_NAMES, MAX_CUSTOM_CATEGORIES } from '@hearthside/core'
import { Card, Label, Notice } from '@hearthside/ui'
import type { Metadata } from 'next'
import Link from 'next/link'
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
import { appInviteSummary, countHomes, listInviteRequests } from '@/server/app-invites'
import { backupAge, getBackupKey, lastBackupDownload } from '@/server/backups'
import { listCustomCategories } from '@/server/categories'
import { requireSession } from '@/server/session'
import { ProfileForm, RestartWelcome } from '../welcome/client'
import { CategoryManager } from './categories'
import {
  AppInviteCreator,
  DownloadBackup,
  InviteCreator,
  LinkPasskeyBackup,
  MemberControls,
  PendingControls,
  RegenerateCodes,
  RemovePasskey,
  RequestControls,
  RevokeAppInvite,
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
  const [people, keys, codesLeft, invites, activity, custom, backup, backupKey] = await Promise.all(
    [
      listMembers(db, household.id, { includePending: isOwner }),
      listPasskeys(db, member.id),
      unusedRecoveryCodeCount(db, member.id),
      isOwner ? listOpenInvites(db, household.id) : Promise.resolve([]),
      isOwner ? recentAudit(db, household.id, 15) : Promise.resolve([]),
      listCustomCategories(db, household.id),
      isOwner ? lastBackupDownload(db, household.id) : Promise.resolve(undefined),
      isOwner ? getBackupKey(db, household.id) : Promise.resolve(undefined),
    ],
  )
  const [friends, requests, homes] = await Promise.all([
    appInviteSummary(db, member),
    member.serverAdmin ? listInviteRequests(db, member) : Promise.resolve([]),
    member.serverAdmin ? countHomes(db, member) : Promise.resolve(0),
  ])
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
            <div className="grid gap-1">
              <h2 className="text-body-strong">Invite to our home</h2>
              <p className="text-caption text-ink-muted">
                For the people you live with. They join {household.name} and see what it shares.
              </p>
            </div>
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

      <Card aria-labelledby="friends-title">
        <Label id="friends-title">Invite a friend to Hearthside</Label>
        <p className="text-ink-muted">
          Your friend creates their own, separate home. They never see yours, and you never see
          theirs.
        </p>
        <AppInviteCreator />
        {friends.open.length > 0 && (
          <ul className="grid divide-y divide-line" data-testid="friend-invites">
            {friends.open.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-1 text-caption">
                <span>Friend invite · expires {date.format(i.expiresAt)}</span>
                <RevokeAppInvite id={i.id} />
              </li>
            ))}
          </ul>
        )}
        {friends.joined > 0 && (
          <p className="text-caption text-ink-muted">
            {friends.joined === 1
              ? '1 friend has started a home.'
              : `${friends.joined} friends have started homes.`}
          </p>
        )}
      </Card>

      {member.serverAdmin && (
        <Card aria-labelledby="requests-title">
          <Label id="requests-title">Invite requests</Label>
          <p className="text-caption text-ink-muted">
            You run this server. It holds {homes === 1 ? '1 home' : `${homes} homes`}.
          </p>
          {requests.length === 0 ? (
            <p className="text-ink-muted">No one is waiting for an invite.</p>
          ) : (
            <ul className="grid divide-y divide-line" data-testid="invite-requests">
              {requests.map((r) => (
                <li key={r.id} className="grid gap-2 py-2">
                  <span>
                    <span className="text-body-strong break-all">{r.email}</span>
                    <span className="block text-caption text-ink-muted">
                      Asked {date.format(r.createdAt)}
                    </span>
                  </span>
                  <RequestControls id={r.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {isOwner && (
        <Card aria-labelledby="backups">
          <Label id="backups">Backups</Label>
          <BackupLine at={backup} />
          <DownloadBackup />
          <p className="text-caption text-ink-muted">
            Made on the spot and saved only on this device, never on the server. It’s encrypted:
            {backupKey
              ? ' your passkey or your offline backup key opens it.'
              : ' your offline backup key opens it.'}{' '}
            Restoring also needs the master key.
          </p>
          <LinkPasskeyBackup linked={Boolean(backupKey)} />
          {backupKey && (
            <Link href="/settings/open-backup" className="text-caption underline">
              Open a backup with your passkey
            </Link>
          )}
        </Card>
      )}

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

const stamp = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function BackupLine({ at }: { at: Date | undefined }) {
  const age = backupAge(at)
  if (age.state === 'never') return <Notice tone="negative">No backup downloaded yet.</Notice>
  const when = stamp.format(age.at)
  if (age.state === 'old')
    return (
      <Notice tone="negative">
        Last backup downloaded {age.days} days ago ({when}). Time for a fresh one.
      </Notice>
    )
  return <p className="text-caption">Last backup downloaded {when}.</p>
}
