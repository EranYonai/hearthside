'use client'

import { Button, Notice } from '@hearthside/ui'
import { Decrypter } from 'age-encryption'
import { useState } from 'react'
import { identityFromSecret } from '@/lib/backup-key'
import { passkeyBackupSecret } from '@/lib/passkey-prf'

/**
 * Decrypts a downloaded backup on this device with the owner's passkey. The file never
 * goes to the server; the result is a plain database dump to restore with pg_restore.
 */
export function OpenBackup({ credentialId }: { credentialId: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function open() {
    if (!file) return
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const { secret } = await passkeyBackupSecret(credentialId)
      const d = new Decrypter()
      d.addIdentity(identityFromSecret(secret))
      secret.fill(0)
      const plain = await d.decrypt(new Uint8Array(await file.arrayBuffer()))
      const url = URL.createObjectURL(new Blob([plain.slice()]))
      const a = document.createElement('a')
      a.href = url
      a.download = file.name.replace(/\.age$/, '') || 'hearthside.dump'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setDone(true)
    } catch (err) {
      setError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Cancelled'
          : 'This passkey can’t open that file. Was it made before you linked your passkey?',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3">
      <p className="text-caption text-ink-muted">
        Pick a downloaded backup (.dump.age). It’s opened here on this device and never sent
        anywhere.
      </p>
      <input
        type="file"
        accept=".age"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-caption"
      />
      <Button
        variant="secondary"
        disabled={!file || busy}
        className="justify-self-start"
        onClick={open}
      >
        {busy ? 'Opening…' : 'Open with my passkey'}
      </Button>
      {done && (
        <Notice tone="positive">
          Saved the opened dump. Restore it as described in docs/backups.md.
        </Notice>
      )}
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}
