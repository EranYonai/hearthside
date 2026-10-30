'use client'

import { useState, useTransition } from 'react'

export type Outcome = { ok: true } | { ok: false; error: string }

/** Run a server action in a transition and keep its error message. */
export function useAction() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  const run = (fn: () => Promise<Outcome>, onOk?: () => void) =>
    start(async () => {
      setError(undefined)
      const result = await fn()
      if (!result.ok) setError(result.error)
      else onOk?.()
    })
  return { pending, error, run }
}
