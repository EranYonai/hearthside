'use client'

import { useState } from 'react'

/**
 * A time in the viewer's own time zone: "14:05" for today, "30 Oct" otherwise. The server
 * renders it in its zone first; the browser corrects it on load.
 */
export function LocalTime({ iso, now }: { iso: string; now?: string }) {
  const date = new Date(iso)
  const [nowMs] = useState(() => (now ? Date.parse(now) : Date.now()))
  const today = new Date(nowMs).toDateString() === date.toDateString()
  const text = new Intl.DateTimeFormat(
    'en-GB',
    today ? { timeStyle: 'short' } : { day: 'numeric', month: 'short' },
  ).format(date)
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  )
}
