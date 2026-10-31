'use client'

import { Button, Notice, TextField } from '@hearthside/ui'
import { ArrowRight, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DISPLAY_CURRENCIES } from '@/lib/onboarding'
import { useAction } from '@/lib/use-action'
import { finishWelcomeAction, restartWelcomeAction, saveProfileAction } from './actions'

const selectClass = 'min-h-11 w-full rounded-md border border-line bg-surface-2 px-3'

export function ProfileForm({
  name: initialName,
  displayCurrency,
  householdName,
  next,
  submitLabel = 'Continue',
}: {
  name: string
  displayCurrency: string
  /** Only for the owner, who may rename the home. */
  householdName?: string
  /** Where to go after saving; stays put when unset. */
  next?: string
  submitLabel?: string
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [name, setName] = useState(initialName)
  const [currency, setCurrency] = useState(displayCurrency)
  const [home, setHome] = useState(householdName ?? '')
  const { pending, error, run } = useAction()
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setSaved(false)
        run(
          () =>
            saveProfileAction({
              name,
              displayCurrency: currency,
              ...(householdName !== undefined ? { householdName: home } : {}),
            }),
          () => {
            if (next) router.push(next)
            else {
              setSaved(true)
              router.refresh()
            }
          },
        )
      }}
    >
      <TextField
        label="Your name"
        name="name"
        required
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="given-name"
        hint="This is how others in your home see you."
      />
      {householdName !== undefined && (
        <TextField
          label="Name of your home"
          name="householdName"
          required
          maxLength={60}
          value={home}
          onChange={(e) => setHome(e.target.value)}
          autoComplete="off"
        />
      )}
      <label className="grid gap-1">
        <span className="text-body-strong">Show amounts in</span>
        <select
          className={selectClass}
          name="displayCurrency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          {DISPLAY_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="text-caption text-ink-muted">
          Totals and charts use this. Each transaction keeps its own currency.
        </span>
      </label>
      {error && <Notice tone="negative">{error}</Notice>}
      {saved && <Notice tone="positive">Saved.</Notice>}
      <Button
        type="submit"
        variant={next ? 'primary' : 'secondary'}
        disabled={pending}
        icon={next ? <ArrowRight aria-hidden /> : undefined}
        className={next ? undefined : 'justify-self-start'}
      >
        {submitLabel}
      </Button>
    </form>
  )
}

/** Marks the welcome steps done and goes home. Used by Finish and by Skip. */
export function FinishButton({
  label = 'Go to my home',
  variant = 'primary',
}: {
  label?: string
  variant?: 'primary' | 'ghost'
}) {
  const router = useRouter()
  const { pending, error, run } = useAction()
  return (
    <div className="grid gap-2">
      <Button
        variant={variant}
        disabled={pending}
        icon={variant === 'primary' ? <Check aria-hidden /> : undefined}
        onClick={() =>
          run(
            () => finishWelcomeAction(),
            () => router.replace('/'),
          )
        }
      >
        {label}
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}

export function RestartWelcome() {
  const router = useRouter()
  const { pending, error, run } = useAction()
  return (
    <div className="grid gap-2">
      <Button
        variant="ghost"
        disabled={pending}
        className="justify-self-start"
        onClick={() =>
          run(
            () => restartWelcomeAction(),
            () => router.push('/welcome'),
          )
        }
      >
        Show the welcome steps again
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}
