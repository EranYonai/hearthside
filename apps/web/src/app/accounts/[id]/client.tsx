'use client'

import {
  ACCOUNT_SWATCHES,
  BRANDS,
  CARD_NETWORKS,
  PROVIDERS,
  accountLook,
  normalizeHexColor,
  type ProviderId,
} from '@hearthside/core'
import { Button, Notice, TextField, cx } from '@hearthside/ui'
import { Check, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AccountCard, NETWORKS } from '@/components/AccountCard'
import { useAction } from '@/lib/use-action'
import { deleteAccountAction, updateAccountAction } from '../actions'

const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]
const BANKS = PROVIDER_IDS.filter((id) => PROVIDERS[id].kind === 'bank')
const CARDS = PROVIDER_IDS.filter((id) => PROVIDERS[id].kind === 'card')
const byLabel = (a: ProviderId, b: ProviderId) =>
  PROVIDERS[a].label.localeCompare(PROVIDERS[b].label)

function Swatch(props: {
  color: string | null
  label: string
  selected: boolean
  onSelect: () => void
}) {
  const ink = props.color ? accountLook({ name: '', color: props.color }).ink! : undefined
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      aria-label={props.label}
      title={props.label}
      onClick={props.onSelect}
      className={cx(
        'grid size-11 place-items-center rounded-pill border border-line',
        props.selected && 'outline-2 outline-offset-2 outline-focus',
        !props.color && 'bg-[linear-gradient(135deg,var(--hs-brand-soft),var(--hs-surface-2))]',
      )}
      style={props.color ? { background: props.color, color: ink } : undefined}
    >
      {props.selected && <Check size={18} aria-hidden />}
    </button>
  )
}

const selectClass = 'min-h-11 w-full rounded-md border border-line bg-surface-2 px-3'

export function EditAccountForm(props: {
  id: string
  name: string
  kind: 'card' | 'bank' | 'other'
  provider: string | null
  color: string | null
  network: string | null
  last4: string | null
  holderId: string
  visibility: 'household' | 'private'
  people: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [name, setName] = useState(props.name)
  const [holderId, setHolderId] = useState(props.holderId)
  const [visibility, setVisibility] = useState(props.visibility)
  const [provider, setProvider] = useState<string | null>(props.provider)
  const [color, setColor] = useState<string | null>(normalizeHexColor(props.color))
  const [network, setNetwork] = useState<string | null>(props.network)
  const brandColor = provider && provider in BRANDS ? BRANDS[provider as ProviderId].color : null
  const custom = color !== null && !(ACCOUNT_SWATCHES as readonly string[]).includes(color)
  const [saved, setSaved] = useState(false)
  const { pending, error, run } = useAction()
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setSaved(false)
        run(
          () =>
            updateAccountAction(props.id, {
              name,
              holderId,
              visibility,
              provider,
              color,
              ...(props.kind === 'card' ? { network } : {}),
            }),
          () => {
            setSaved(true)
            router.refresh()
          },
        )
      }}
    >
      <div className="max-w-64">
        <AccountCard
          name={name || props.name}
          kind={props.kind}
          provider={provider}
          color={color}
          network={network}
          last4={props.last4}
        />
      </div>
      <TextField
        label="Account name"
        name="name"
        required
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="off"
      />
      <label className="grid gap-1">
        <span className="text-body-strong">Bank or card company</span>
        <select
          className={selectClass}
          value={provider ?? ''}
          onChange={(e) => setProvider(e.target.value || null)}
        >
          <option value="">None of these</option>
          <optgroup label="Banks">
            {[...BANKS].sort(byLabel).map((id) => (
              <option key={id} value={id}>
                {PROVIDERS[id].label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Cards">
            {[...CARDS].sort(byLabel).map((id) => (
              <option key={id} value={id}>
                {PROVIDERS[id].label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {props.kind === 'card' && (
        <label className="grid gap-1">
          <span className="text-body-strong">Card network</span>
          <select
            className={selectClass}
            value={network ?? ''}
            onChange={(e) => setNetwork(e.target.value || null)}
          >
            <option value="">Not shown</option>
            {CARD_NETWORKS.map((n) => (
              <option key={n} value={n}>
                {NETWORKS[n]?.label ?? n}
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-body-strong">Color</legend>
        <div role="radiogroup" aria-label="Color" className="flex flex-wrap items-center gap-2">
          <Swatch
            color={brandColor}
            label={brandColor ? 'Company color' : 'No color'}
            selected={color === null}
            onSelect={() => setColor(null)}
          />
          {ACCOUNT_SWATCHES.map((c) => (
            <Swatch
              key={c}
              color={c}
              label={c}
              selected={color === c}
              onSelect={() => setColor(c)}
            />
          ))}
          <label
            className={cx(
              'relative grid size-11 cursor-pointer place-items-center overflow-hidden rounded-pill border border-line bg-[conic-gradient(#E30520,#E8B100,#00763A,#00B6AD,#0C4DA2,#5B2C83,#D6006F,#E30520)]',
              custom && 'outline-2 outline-offset-2 outline-focus',
            )}
            title="Your own color"
          >
            <span className="sr-only">Your own color</span>
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={color ?? brandColor ?? '#6B4F3A'}
              onChange={(e) => setColor(normalizeHexColor(e.target.value))}
            />
            {custom && (
              <span
                aria-hidden
                className="size-6 rounded-pill border-2 border-white"
                style={{ background: color! }}
              />
            )}
          </label>
        </div>
        <span className="text-caption text-ink-muted">
          {color === null
            ? brandColor
              ? 'Using the company’s color.'
              : 'Pick a company or a color to make it stand out.'
            : 'Your own color, only in Hearthside.'}
        </span>
      </fieldset>
      <label className="grid gap-1">
        <span className="text-body-strong">Whose is it</span>
        <select
          className={selectClass}
          value={holderId}
          onChange={(e) => setHolderId(e.target.value)}
        >
          {props.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-body-strong">Who can see it</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="visibility"
            checked={visibility === 'household'}
            onChange={() => setVisibility('household')}
          />
          Everyone in the home
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="visibility"
            checked={visibility === 'private'}
            onChange={() => setVisibility('private')}
          />
          Only the person who added it and whose it is
        </label>
      </fieldset>
      {error && <Notice tone="negative">{error}</Notice>}
      {saved && <Notice tone="positive">Saved.</Notice>}
      <Button type="submit" disabled={pending} className="justify-self-start">
        Save
      </Button>
    </form>
  )
}

/** Two steps: ask, then confirm with the count of what goes with it. */
export function DeleteAccount(props: { id: string; name: string; transactions: number }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const { pending, error, run } = useAction()
  const what =
    props.transactions === 0
      ? 'It has no transactions.'
      : props.transactions === 1
        ? 'Its 1 transaction goes with it.'
        : `Its ${props.transactions} transactions go with it.`
  return (
    <div className="grid gap-3">
      {confirming ? (
        <>
          <Notice tone="negative">
            Delete “{props.name}”? {what} This can’t be undone.
          </Notice>
          <span className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={pending}
              icon={<Trash2 aria-hidden />}
              className="text-negative"
              onClick={() =>
                run(
                  () => deleteAccountAction(props.id),
                  () => router.replace('/accounts'),
                )
              }
            >
              Delete account
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </span>
        </>
      ) : (
        <Button
          variant="ghost"
          icon={<Trash2 aria-hidden />}
          className="justify-self-start text-negative"
          onClick={() => setConfirming(true)}
        >
          Delete this account
        </Button>
      )}
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}
