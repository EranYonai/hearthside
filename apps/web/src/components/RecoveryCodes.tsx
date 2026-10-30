'use client'

import { Button, Card, Label, Notice } from '@hearthside/ui'
import { Copy } from 'lucide-react'
import { useState } from 'react'

/** Shown once, right after the codes are created. */
export function RecoveryCodes({
  codes,
  onDone,
  doneLabel = 'I’ve saved them',
}: {
  codes: string[]
  onDone: () => void
  doneLabel?: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Card aria-labelledby="recovery-title">
      <Label id="recovery-title">Recovery codes</Label>
      <p>
        If you lose every device with your passkey, one of these codes gets you back in. Each works
        once. Save them in your password manager or print them. You won’t see them again.
      </p>
      <ol
        className="grid grid-cols-2 gap-2 font-display text-amount tabular-nums"
        data-testid="recovery-codes"
      >
        {codes.map((code) => (
          <li key={code} className="rounded-sm bg-surface-2 px-2 py-1 text-center">
            {code}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          icon={<Copy aria-hidden />}
          onClick={async () => {
            await navigator.clipboard?.writeText(codes.join('\n')).catch(() => {})
            setCopied(true)
          }}
        >
          {copied ? 'Copied' : 'Copy codes'}
        </Button>
        <Button onClick={onDone}>{doneLabel}</Button>
      </div>
      {copied && <Notice tone="positive">Copied to the clipboard.</Notice>}
    </Card>
  )
}
