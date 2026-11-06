'use client'

import { Notice } from '@hearthside/ui'
import { useSyncExternalStore } from 'react'
import { isInAppBrowser } from '@/lib/in-app-browser'

const noop = () => () => {}

function browserKind(): 'ios' | 'other' | 'ok' {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (!isInAppBrowser(navigator.userAgent, standalone)) return 'ok'
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios' : 'other'
}

/** Asks people to leave an app's built-in browser, where passkeys can't be saved. */
export function InAppBrowserNotice() {
  const kind = useSyncExternalStore(noop, browserKind, () => 'ok' as const)
  if (kind === 'ok') return null
  return (
    <Notice tone="warning">
      This page is open inside another app, which can’t save a passkey on your phone. Open the link
      in {kind === 'ios' ? 'Safari' : 'your browser'} instead (use the app’s menu, then “Open in
      browser”).
    </Notice>
  )
}
