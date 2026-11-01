'use client'

import { HOLDING_CURRENCIES, LOAN_KINDS, formatMoney } from '@hearthside/core'
import { Button, Notice, TextField } from '@hearthside/ui'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { useAction } from '@/lib/use-action'
import {
  createLoanAction,
  createPropertyAction,
  deleteLoanAction,
  deletePropertyAction,
  setLoanBalanceAction,
  setPaymentExampleAction,
  setRentExampleAction,
  updateLoanAction,
  updatePropertyAction,
} from './estate-actions'

const selectClass = 'min-h-11 w-full rounded-md border border-line bg-surface-2 px-3'

type Visibility = 'household' | 'private'
type Person = { id: string; name: string }

/** Minor units as a plain number for an input, e.g. 125000000 → "1250000". */
const asInput = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? '' : String(minor / 100)

function Select(props: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly { value: string; label: string }[]
  name?: string
}) {
  const id = useId()
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-body-strong">
        {props.label}
      </label>
      <select
        id={id}
        name={props.name}
        className={selectClass}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

const CURRENCIES = HOLDING_CURRENCIES.map((c) => ({ value: c, label: c }))

function Ownership(props: {
  people: Person[]
  holderId: string
  setHolderId: (v: string) => void
  visibility: Visibility
  setVisibility: (v: Visibility) => void
  name: string
}) {
  return (
    <>
      {props.people.length > 1 && (
        <Select
          label="Whose is it"
          value={props.holderId}
          onChange={props.setHolderId}
          options={props.people.map((p) => ({ value: p.id, label: p.name }))}
        />
      )}
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-body-strong">Who can see it</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name={`${props.name}-visibility`}
            checked={props.visibility === 'household'}
            onChange={() => props.setVisibility('household')}
          />
          Everyone in the home
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name={`${props.name}-visibility`}
            checked={props.visibility === 'private'}
            onChange={() => props.setVisibility('private')}
          />
          Only the person who added it and whose it is
        </label>
      </fieldset>
    </>
  )
}

export interface PropertyValues {
  id: string
  name: string
  currency: string
  valueMinor: number
  valueOn: string
  purchaseMinor: number | null
  purchasedOn: string | null
  rentMinor: number | null
  visibility: Visibility
  holderId: string
}

/** Add a property, or edit one when `property` is given. */
export function PropertyForm(props: {
  property?: PropertyValues
  people: Person[]
  selfId: string
  defaultCurrency: string
  today: string
}) {
  const router = useRouter()
  const p = props.property
  const [name, setName] = useState(p?.name ?? '')
  const [currency, setCurrency] = useState(p?.currency ?? props.defaultCurrency)
  const [value, setValue] = useState(asInput(p?.valueMinor))
  const [valueOn, setValueOn] = useState(p?.valueOn ?? props.today)
  const [purchase, setPurchase] = useState(asInput(p?.purchaseMinor))
  const [purchasedOn, setPurchasedOn] = useState(p?.purchasedOn ?? '')
  const [rent, setRent] = useState(asInput(p?.rentMinor))
  const [visibility, setVisibility] = useState<Visibility>(p?.visibility ?? 'household')
  const [holderId, setHolderId] = useState(p?.holderId ?? props.selfId)
  const [saved, setSaved] = useState(false)
  const { pending, error, run } = useAction()
  return (
    <form
      className="grid gap-4"
      aria-label={p ? 'Property details' : 'Add a property'}
      onSubmit={(e) => {
        e.preventDefault()
        setSaved(false)
        const input = {
          name,
          currency,
          value,
          valueOn,
          purchase,
          purchasedOn,
          rent,
          visibility,
          holderId,
        }
        if (p)
          run(
            () => updatePropertyAction(p.id, input),
            () => {
              setSaved(true)
              router.refresh()
            },
          )
        else
          run(async () => {
            const result = await createPropertyAction(input)
            if (result.ok) router.push(`/invest/property/${result.id}`)
            return result
          })
      }}
    >
      <TextField
        label="Name"
        name="property-name"
        required
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="off"
        hint="Whatever helps you tell it apart, like “The flat”"
      />
      <Select label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES} />
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
        <TextField
          label="What it’s worth"
          name="property-value"
          required
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
        />
        <TextField
          label="As of"
          name="property-value-on"
          type="date"
          value={valueOn}
          max={props.today}
          onChange={(e) => setValueOn(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
        <TextField
          label="Price paid (optional)"
          name="property-purchase"
          inputMode="decimal"
          value={purchase}
          onChange={(e) => setPurchase(e.target.value)}
          autoComplete="off"
        />
        <TextField
          label="Bought on"
          name="property-purchased-on"
          type="date"
          value={purchasedOn}
          max={props.today}
          onChange={(e) => setPurchasedOn(e.target.value)}
        />
      </div>
      <TextField
        label="Monthly rent (optional)"
        name="property-rent"
        inputMode="decimal"
        value={rent}
        onChange={(e) => setRent(e.target.value)}
        autoComplete="off"
        hint="If it’s rented out. Used to find the rent in your bank statements."
      />
      <Ownership
        name="property"
        people={props.people}
        holderId={holderId}
        setHolderId={setHolderId}
        visibility={visibility}
        setVisibility={setVisibility}
      />
      {error && <Notice tone="negative">{error}</Notice>}
      {saved && <Notice tone="positive">Saved.</Notice>}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {p ? 'Save' : 'Add property'}
      </Button>
    </form>
  )
}

export interface LoanValues {
  id: string
  name: string
  kind: string
  lender: string | null
  currency: string
  principalMinor: number
  rate: string
  termMonths: number
  startOn: string
  paymentMinor: number | null
  propertyId: string | null
  visibility: Visibility
  holderId: string
}

/** Add a loan, or edit one when `loan` is given. */
export function LoanForm(props: {
  loan?: LoanValues
  properties: { id: string; name: string }[]
  people: Person[]
  selfId: string
  defaultCurrency: string
  today: string
}) {
  const router = useRouter()
  const l = props.loan
  const [name, setName] = useState(l?.name ?? '')
  const [kind, setKind] = useState(l?.kind ?? 'mortgage')
  const [lender, setLender] = useState(l?.lender ?? '')
  const [currency, setCurrency] = useState(l?.currency ?? props.defaultCurrency)
  const [principal, setPrincipal] = useState(asInput(l?.principalMinor))
  const [rate, setRate] = useState(l?.rate ?? '')
  const [years, setYears] = useState(l ? String(l.termMonths / 12) : '')
  const [startOn, setStartOn] = useState(l?.startOn ?? '')
  const [payment, setPayment] = useState(asInput(l?.paymentMinor))
  const [propertyId, setPropertyId] = useState(l?.propertyId ?? '')
  const [visibility, setVisibility] = useState<Visibility>(l?.visibility ?? 'household')
  const [holderId, setHolderId] = useState(l?.holderId ?? props.selfId)
  const [saved, setSaved] = useState(false)
  const { pending, error, run } = useAction()
  return (
    <form
      className="grid gap-4"
      aria-label={l ? 'Loan details' : 'Add a loan'}
      onSubmit={(e) => {
        e.preventDefault()
        setSaved(false)
        const y = Number(years.replace(',', '.'))
        const input = {
          name,
          kind,
          lender,
          currency,
          principal,
          rate,
          termMonths: Number.isFinite(y) ? Math.round(y * 12) : NaN,
          startOn,
          payment,
          propertyId,
          visibility,
          holderId,
        }
        if (l)
          run(
            () => updateLoanAction(l.id, input),
            () => {
              setSaved(true)
              router.refresh()
            },
          )
        else
          run(async () => {
            const result = await createLoanAction(input)
            if (result.ok) router.push(`/invest/loan/${result.id}`)
            return result
          })
      }}
    >
      <TextField
        label="Name"
        name="loan-name"
        required
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="off"
        hint="Like “Flat mortgage” or “Car loan”"
      />
      <Select
        label="Kind"
        value={kind}
        onChange={setKind}
        options={LOAN_KINDS.map((k) => ({ value: k.slug, label: k.label }))}
      />
      <TextField
        label="Lender (optional)"
        name="loan-lender"
        maxLength={60}
        value={lender}
        onChange={(e) => setLender(e.target.value)}
        autoComplete="off"
      />
      <Select label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES} />
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
        <TextField
          label="Amount borrowed"
          name="loan-principal"
          required
          inputMode="decimal"
          value={principal}
          onChange={(e) => setPrincipal(e.target.value)}
          autoComplete="off"
        />
        <TextField
          label="Yearly rate, %"
          name="loan-rate"
          required
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
        <TextField
          label="Term, years"
          name="loan-years"
          required
          inputMode="decimal"
          value={years}
          onChange={(e) => setYears(e.target.value)}
          autoComplete="off"
        />
        <TextField
          label="Started on"
          name="loan-start"
          type="date"
          required
          value={startOn}
          max={props.today}
          onChange={(e) => setStartOn(e.target.value)}
        />
      </div>
      <TextField
        label="Monthly payment (optional)"
        name="loan-payment"
        inputMode="decimal"
        value={payment}
        onChange={(e) => setPayment(e.target.value)}
        autoComplete="off"
        hint="Leave empty to work it out from the terms."
      />
      {props.properties.length > 0 && (
        <Select
          label="Secured on (optional)"
          value={propertyId}
          onChange={setPropertyId}
          options={[
            { value: '', label: 'No property' },
            ...props.properties.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      )}
      <Ownership
        name="loan"
        people={props.people}
        holderId={holderId}
        setHolderId={setHolderId}
        visibility={visibility}
        setVisibility={setVisibility}
      />
      {error && <Notice tone="negative">{error}</Notice>}
      {saved && <Notice tone="positive">Saved.</Notice>}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {l ? 'Save' : 'Add loan'}
      </Button>
    </form>
  )
}

/** A balance from the lender's statement, to put the schedule right. */
export function LoanBalanceForm(props: {
  id: string
  minor: number | null
  on: string | null
  today: string
}) {
  const router = useRouter()
  const [balance, setBalance] = useState(asInput(props.minor))
  const [on, setOn] = useState(props.on ?? props.today)
  const [saved, setSaved] = useState(false)
  const { pending, error, run } = useAction()
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        setSaved(false)
        run(
          () => setLoanBalanceAction(props.id, { balance, on }),
          () => {
            setSaved(true)
            router.refresh()
          },
        )
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
        <TextField
          label="Balance the lender reports"
          name="loan-balance"
          inputMode="decimal"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          autoComplete="off"
        />
        <TextField
          label="As of"
          name="loan-balance-on"
          type="date"
          value={on}
          max={props.today}
          onChange={(e) => setOn(e.target.value)}
        />
      </div>
      <p className="text-caption text-ink-muted">
        From the lender’s statement. Leave empty to go back to the schedule.
      </p>
      <span className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          Update balance
        </Button>
        {saved && !pending && <span className="text-caption text-positive">Saved</span>}
      </span>
      {error && <Notice tone="negative">{error}</Notice>}
    </form>
  )
}

/**
 * Pick one bank row as the example of rent or a loan payment. Rows with the same description and
 * a similar amount are tied too, now and in future imports.
 */
export function ExamplePicker(props: {
  target: 'rent' | 'loan'
  id: string
  candidates: { id: string; on: string; description: string; minor: number; account: string }[]
  tied: boolean
}) {
  const router = useRouter()
  const [choice, setChoice] = useState(props.candidates[0]?.id ?? '')
  const [result, setResult] = useState<string>()
  const { pending, error, run } = useAction()
  const set = (transactionId: string | null) =>
    run(
      async () => {
        const r =
          props.target === 'rent'
            ? await setRentExampleAction(props.id, transactionId)
            : await setPaymentExampleAction(props.id, transactionId)
        if (r.ok)
          setResult(
            transactionId
              ? `Tied ${r.changed} bank ${r.changed === 1 ? 'row' : 'rows'}.`
              : 'No longer tied.',
          )
        return r
      },
      () => router.refresh(),
    )
  const what = props.target === 'rent' ? 'rent deposit' : 'loan payment'
  return (
    <div className="grid gap-3">
      {props.candidates.length === 0 ? (
        <p className="text-caption text-ink-muted">
          No recent bank {props.target === 'rent' ? 'deposits' : 'payments'} to pick from. Import a
          bank statement first.
        </p>
      ) : (
        <>
          <Select
            label={`Which bank row is the ${what}?`}
            value={choice}
            onChange={setChoice}
            options={props.candidates.map((c) => ({
              value: c.id,
              label: `${c.on} · ${c.description} · ${formatMoney(c.minor, { signed: true })} · ${c.account}`,
            }))}
          />
          <p className="text-caption text-ink-muted">
            Rows with the same description and a similar amount are tied too, including future
            imports.
          </p>
        </>
      )}
      <span className="flex flex-wrap gap-2">
        {props.candidates.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !choice}
            onClick={() => set(choice)}
          >
            {props.tied ? 'Tie this one instead' : `Tie the ${what}`}
          </Button>
        )}
        {props.tied && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => set(null)}>
            Stop tying
          </Button>
        )}
      </span>
      {result && !pending && <p className="text-caption text-positive">{result}</p>}
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}

/** Two taps to delete a property or loan. */
export function DeleteEstateButton(props: { target: 'property' | 'loan'; id: string }) {
  const router = useRouter()
  const { pending, error, run } = useAction()
  const [armed, setArmed] = useState(false)
  const label = props.target === 'property' ? 'property' : 'loan'
  return (
    <div className="grid gap-2">
      <Button
        variant="secondary"
        disabled={pending}
        className="justify-self-start"
        onClick={() =>
          armed
            ? run(
                () =>
                  props.target === 'property'
                    ? deletePropertyAction(props.id)
                    : deleteLoanAction(props.id),
                () => router.push('/invest'),
              )
            : setArmed(true)
        }
      >
        <Trash2 aria-hidden />
        {armed ? `Tap again to delete the ${label}` : `Delete ${label}`}
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}
