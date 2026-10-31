'use client'

import { ASSET_CLASSES, HOLDING_CURRENCIES, MOVEMENT_KINDS } from '@hearthside/core'
import { Button, Notice, TextField } from '@hearthside/ui'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { useAction } from '@/lib/use-action'
import {
  addMovementAction,
  createInvestmentAccountAction,
  deleteInvestmentAccountAction,
  removeHoldingAction,
  removeMovementAction,
  saveFundFactsAction,
  saveInvestSettingsAction,
  saveHoldingAction,
  setDisplayCurrencyAction,
  updateInvestmentAccountAction,
} from './actions'

const selectClass = 'min-h-11 w-full rounded-md border border-line bg-surface-2 px-3'

type Visibility = 'household' | 'private'

function CurrencySelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const id = useId()
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-body-strong">
        {label}
      </label>
      <select
        id={id}
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {HOLDING_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Add an investment account, or edit one when `account` is given. */
export function InvestmentAccountForm(props: {
  account?: {
    id: string
    name: string
    provider: string | null
    currency: string
    visibility: Visibility
    holderId: string
  }
  people: { id: string; name: string }[]
  selfId: string
  defaultCurrency: string
}) {
  const router = useRouter()
  const a = props.account
  const [name, setName] = useState(a?.name ?? '')
  const [provider, setProvider] = useState(a?.provider ?? '')
  const [currency, setCurrency] = useState(
    a?.currency ??
      (HOLDING_CURRENCIES.includes(props.defaultCurrency as never) ? props.defaultCurrency : 'ILS'),
  )
  const [visibility, setVisibility] = useState<Visibility>(a?.visibility ?? 'household')
  const [holderId, setHolderId] = useState(a?.holderId ?? props.selfId)
  const [saved, setSaved] = useState(false)
  const { pending, error, run } = useAction()
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setSaved(false)
        const input = { name, provider, currency, visibility, holderId }
        if (a)
          run(
            () => updateInvestmentAccountAction(a.id, input),
            () => {
              setSaved(true)
              router.refresh()
            },
          )
        else
          run(
            async () => {
              const result = await createInvestmentAccountAction(input)
              if (result.ok) router.push(`/invest/${result.id}`)
              return result
            },
            () => {},
          )
      }}
    >
      <TextField
        label="Account name"
        name="name"
        required
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="off"
        hint="Whatever helps you tell it apart, like “Long-term savings”"
      />
      <TextField
        label="Where it’s held (optional)"
        name="provider"
        maxLength={60}
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
        autoComplete="off"
      />
      <CurrencySelect label="Account currency" value={currency} onChange={setCurrency} />
      {props.people.length > 1 && (
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
      )}
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
        {a ? 'Save' : 'Add account'}
      </Button>
    </form>
  )
}

/** Add a holding by hand, or change one when `holding` is given. */
export function HoldingForm(props: {
  accountId: string
  accountCurrency: string
  holding?: {
    kind: 'security' | 'cash'
    symbol: string
    name: string
    currency: string
    assetClass: string
    units: string
  }
  onDone?: () => void
}) {
  const router = useRouter()
  const h = props.holding
  const [kind, setKind] = useState<'security' | 'cash'>(h?.kind ?? 'security')
  const [symbol, setSymbol] = useState(h?.symbol ?? '')
  const [name, setName] = useState(h?.name ?? '')
  const [currency, setCurrency] = useState(h?.currency ?? props.accountCurrency)
  const [assetClass, setAssetClass] = useState(h?.assetClass ?? 'global_stocks')
  const [units, setUnits] = useState(h?.units ?? '')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const { pending, error, run } = useAction()
  const editing = !!h
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () =>
            saveHoldingAction(props.accountId, {
              kind,
              symbol,
              name,
              currency,
              assetClass,
              units,
              price,
              cost,
            }),
          () => {
            if (!editing) {
              setSymbol('')
              setName('')
              setUnits('')
              setPrice('')
              setCost('')
            }
            props.onDone?.()
            router.refresh()
          },
        )
      }}
    >
      {!editing && (
        <fieldset className="grid gap-1">
          <legend className="mb-1 text-body-strong">What is it</legend>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="kind"
              checked={kind === 'security'}
              onChange={() => setKind('security')}
            />
            A fund, share or bond
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="kind"
              checked={kind === 'cash'}
              onChange={() => setKind('cash')}
            />
            Cash in the account
          </label>
        </fieldset>
      )}
      {kind === 'security' && !editing && (
        <>
          <TextField
            label="Ticker or fund number"
            name="symbol"
            required
            maxLength={20}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
          />
          <TextField
            label="Name"
            name="holding-name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </>
      )}
      {kind === 'security' && (
        <label className="grid gap-1">
          <span className="text-body-strong">Asset type</span>
          <select
            className={selectClass}
            value={assetClass}
            onChange={(e) => setAssetClass(e.target.value)}
          >
            {ASSET_CLASSES.filter((c) => c.slug !== 'cash').map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {!editing && (
        <CurrencySelect
          label={kind === 'cash' ? 'Currency' : 'Priced in'}
          value={currency}
          onChange={setCurrency}
        />
      )}
      <TextField
        label={kind === 'cash' ? 'Amount' : 'Units'}
        name="units"
        required
        inputMode="decimal"
        value={units}
        onChange={(e) => setUnits(e.target.value)}
        autoComplete="off"
      />
      {kind === 'security' && (
        <>
          <TextField
            label={`Price per unit in ${currency} (optional)`}
            name="price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            autoComplete="off"
            hint={
              editing
                ? 'Leave empty to keep the last price'
                : 'Until live prices arrive, this is the price we use'
            }
          />
          <TextField
            label={`Total paid in ${currency} (optional)`}
            name="cost"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            autoComplete="off"
          />
        </>
      )}
      {error && <Notice tone="negative">{error}</Notice>}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {editing ? 'Save' : 'Add holding'}
      </Button>
    </form>
  )
}

/** Two taps to remove, so a stray tap can't delete anything. */
function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  pending,
}: {
  label: string
  confirmLabel: string
  onConfirm: () => void
  pending: boolean
}) {
  const [armed, setArmed] = useState(false)
  return (
    <Button
      variant={armed ? 'primary' : 'ghost'}
      disabled={pending}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      aria-label={armed ? confirmLabel : label}
    >
      <Trash2 aria-hidden />
      {armed ? confirmLabel : null}
    </Button>
  )
}

export function RemoveHoldingButton(props: { accountId: string; holdingId: string; name: string }) {
  const router = useRouter()
  const { pending, error, run } = useAction()
  return (
    <>
      <ConfirmButton
        label={`Remove ${props.name}`}
        confirmLabel="Tap again to remove"
        pending={pending}
        onConfirm={() =>
          run(
            () => removeHoldingAction(props.accountId, props.holdingId),
            () => router.refresh(),
          )
        }
      />
      {error && <Notice tone="negative">{error}</Notice>}
    </>
  )
}

export function DeleteAccountButton(props: { id: string }) {
  const router = useRouter()
  const { pending, error, run } = useAction()
  const [armed, setArmed] = useState(false)
  return (
    <div className="grid gap-2">
      <Button
        variant="secondary"
        disabled={pending}
        className="justify-self-start"
        onClick={() =>
          armed
            ? run(
                () => deleteInvestmentAccountAction(props.id),
                () => router.push('/invest'),
              )
            : setArmed(true)
        }
      >
        <Trash2 aria-hidden />
        {armed ? 'Tap again to delete the account and its holdings' : 'Delete account'}
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}

/** Quick switch for the member's display currency. Same setting as in Settings. */
export function CurrencySwitch(props: {
  value: string
  options: readonly { code: string; symbol: string }[]
}) {
  const router = useRouter()
  const { pending, error, run } = useAction()
  return (
    <div className="grid justify-items-end gap-1">
      <div
        role="radiogroup"
        aria-label="Show values in"
        className="flex rounded-pill bg-surface-2 p-0.5"
      >
        {props.options.map((o) => {
          const on = o.code === props.value
          return (
            <button
              key={o.code}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={o.code}
              disabled={pending}
              onClick={() =>
                on ||
                run(
                  () => setDisplayCurrencyAction(o.code),
                  () => router.refresh(),
                )
              }
              className={`min-h-9 min-w-11 rounded-pill px-2 font-display text-body-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${on ? 'bg-surface-1 text-ink shadow-card' : 'text-ink-muted'}`}
            >
              {o.symbol}
            </button>
          )
        })}
      </div>
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}

/** Record money moving in or out of an account: deposits, withdrawals, fees, income. */
export function MovementForm(props: { accountId: string; currency: string; today: string }) {
  const router = useRouter()
  const kindId = useId()
  const [kind, setKind] = useState<string>('deposit')
  const [on, setOn] = useState(props.today)
  const [amount, setAmount] = useState('')
  const { pending, error, run } = useAction()
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () => addMovementAction(props.accountId, { kind, on, amount }),
          () => {
            setAmount('')
            router.refresh()
          },
        )
      }}
    >
      <div className="grid gap-1">
        <label htmlFor={kindId} className="text-body-strong">
          What was it
        </label>
        <select
          id={kindId}
          className={selectClass}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {MOVEMENT_KINDS.map((k) => (
            <option key={k.slug} value={k.slug}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <TextField
        label="Date"
        name="on"
        type="date"
        required
        max={props.today}
        value={on}
        onChange={(e) => setOn(e.target.value)}
      />
      <TextField
        label={`Amount in ${props.currency}`}
        name="amount"
        inputMode="decimal"
        required
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        autoComplete="off"
      />
      {error && <Notice tone="negative">{error}</Notice>}
      <Button type="submit" disabled={pending} className="justify-self-start">
        Add
      </Button>
    </form>
  )
}

export function RemoveMovementButton(props: { accountId: string; id: string; label: string }) {
  const router = useRouter()
  const { pending, error, run } = useAction()
  return (
    <>
      <ConfirmButton
        label={`Remove ${props.label}`}
        confirmLabel="Tap again to remove"
        pending={pending}
        onConfirm={() =>
          run(
            () => removeMovementAction(props.accountId, props.id),
            () => router.refresh(),
          )
        }
      />
      {error && <Notice tone="negative">{error}</Notice>}
    </>
  )
}

/** Edit the facts kept about a fund: yearly fee, index, domicile and document links. */
export function FundFactsForm(props: {
  holdingId: string
  facts: {
    fee: string | null
    index: string | null
    domicile: string | null
    documents: { label: string; url: string }[]
  } | null
}) {
  const router = useRouter()
  const f = props.facts
  const [fee, setFee] = useState(f?.fee ?? '')
  const [index, setIndex] = useState(f?.index ?? '')
  const [domicile, setDomicile] = useState(f?.domicile ?? '')
  const [docs, setDocs] = useState(() => {
    const list = (f?.documents ?? []).map((d) => ({ ...d }))
    return list.length < 5 ? [...list, { label: '', url: '' }] : list
  })
  const [saved, setSaved] = useState(false)
  const { pending, error, run } = useAction()
  const setDoc = (i: number, key: 'label' | 'url', value: string) =>
    setDocs((list) => {
      const next = list.map((d, j) => (j === i ? { ...d, [key]: value } : d))
      const last = next.at(-1)!
      return last.url && next.length < 5 ? [...next, { label: '', url: '' }] : next
    })
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setSaved(false)
        run(
          () => saveFundFactsAction(props.holdingId, { fee, index, domicile, documents: docs }),
          () => {
            setSaved(true)
            router.refresh()
          },
        )
      }}
    >
      <TextField
        label="Yearly fee (%)"
        name="fee"
        inputMode="decimal"
        value={fee}
        onChange={(e) => setFee(e.target.value)}
        hint="The total expense ratio, like 0.07"
        autoComplete="off"
      />
      <TextField
        label="Index it tracks"
        name="index"
        maxLength={80}
        value={index}
        onChange={(e) => setIndex(e.target.value)}
        autoComplete="off"
      />
      <TextField
        label="Domicile"
        name="domicile"
        maxLength={40}
        value={domicile}
        onChange={(e) => setDomicile(e.target.value)}
        hint="Where the fund is registered, which can matter for tax"
        autoComplete="off"
      />
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-body-strong">Documents</legend>
        {docs.map((d, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-2">
            <TextField
              label={`Document ${i + 1} name`}
              name={`doc-label-${i}`}
              maxLength={40}
              value={d.label}
              onChange={(e) => setDoc(i, 'label', e.target.value)}
              autoComplete="off"
            />
            <TextField
              label={`Document ${i + 1} link`}
              name={`doc-url-${i}`}
              type="url"
              placeholder="https://"
              value={d.url}
              onChange={(e) => setDoc(i, 'url', e.target.value)}
              autoComplete="off"
            />
          </div>
        ))}
      </fieldset>
      {error && <Notice tone="negative">{error}</Notice>}
      {saved && !error && <Notice tone="positive">Saved.</Notice>}
      <Button type="submit" disabled={pending} className="justify-self-start">
        Save fund facts
      </Button>
    </form>
  )
}

/** The household's investing preferences, for the check-up. */
export function InvestSettingsForm(props: {
  settings: { stocksTarget: number; emergencyMonths: number; checkupOn: boolean }
}) {
  const router = useRouter()
  const sliderId = useId()
  const [stocks, setStocks] = useState(String(props.settings.stocksTarget))
  const [months, setMonths] = useState(String(props.settings.emergencyMonths))
  const [on, setOn] = useState(props.settings.checkupOn)
  const [saved, setSaved] = useState(false)
  const { pending, error, run } = useAction()
  const n = Number(stocks)
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setSaved(false)
        run(
          () =>
            saveInvestSettingsAction({
              stocksTarget: stocks,
              emergencyMonths: months,
              checkupOn: on,
            }),
          () => {
            setSaved(true)
            router.refresh()
          },
        )
      }}
    >
      <div className="grid gap-1">
        <label htmlFor={sliderId} className="text-body-strong">
          Target split
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={stocks}
          onChange={(e) => setStocks(e.target.value)}
          aria-valuetext={`${n}% stocks, ${100 - n}% bonds and cash`}
          className="min-h-11 accent-[var(--hs-brand)]"
        />
        <span className="text-caption text-ink-muted" data-testid="split-label">
          {n}% stocks / {100 - n}% bonds and cash
        </span>
      </div>
      <TextField
        label="Emergency fund, in months of spending"
        name="months"
        inputMode="numeric"
        value={months}
        onChange={(e) => setMonths(e.target.value)}
        autoComplete="off"
      />
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        Show the check-up
      </label>
      {error && <Notice tone="negative">{error}</Notice>}
      {saved && !error && <Notice tone="positive">Saved.</Notice>}
      <Button type="submit" disabled={pending} className="justify-self-start">
        Save
      </Button>
    </form>
  )
}
