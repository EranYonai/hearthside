'use client'

import { Button, Notice, TextField } from '@hearthside/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAction } from '@/lib/use-action'
import { updateAccountAction } from '../actions'

const selectClass = 'min-h-11 w-full rounded-md border border-line bg-surface-2 px-3'

export function EditAccountForm(props: {
  id: string
  name: string
  holderId: string
  visibility: 'household' | 'private'
  people: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [name, setName] = useState(props.name)
  const [holderId, setHolderId] = useState(props.holderId)
  const [visibility, setVisibility] = useState(props.visibility)
  const [saved, setSaved] = useState(false)
  const { pending, error, run } = useAction()
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setSaved(false)
        run(
          () => updateAccountAction(props.id, { name, holderId, visibility }),
          () => {
            setSaved(true)
            router.refresh()
          },
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
      />
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
