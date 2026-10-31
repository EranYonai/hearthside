'use client'

import { Button } from '@hearthside/ui'
import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'

const POLL_MS = 15_000

/** Re-runs the server check; once approved, the page redirects home. */
export function CheckAgain() {
  const router = useRouter()
  const [pending, start] = useTransition()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_MS)
    return () => clearInterval(id)
  }, [router])
  return (
    <Button
      variant="primary"
      disabled={pending}
      icon={<RefreshCw aria-hidden />}
      onClick={() => start(() => router.refresh())}
    >
      Check again
    </Button>
  )
}
