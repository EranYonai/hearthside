import type { Metadata } from 'next'
import { AuthShell } from '@/components/AuthShell'
import { RecoverForm } from './RecoverForm'

export const metadata: Metadata = { title: 'Recover · Hearthside' }

export default function RecoverPage() {
  return (
    <AuthShell
      title="Use a recovery code"
      lead="Each code works once. After this you’ll add a new passkey."
    >
      <RecoverForm />
    </AuthShell>
  )
}
