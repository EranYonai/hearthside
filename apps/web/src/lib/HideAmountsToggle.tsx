'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { applyHidden, readHidden } from './privacy'

const CHANGE = 'hs-hide-amounts-change'

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE, onChange)
  }
}

/** A small eye button that hides the headline numbers on this device. */
export function HideAmountsToggle() {
  const hidden = useSyncExternalStore(
    subscribe,
    () => readHidden(globalThis.localStorage),
    () => false,
  )
  const Icon = hidden ? EyeOff : Eye
  return (
    <button
      type="button"
      aria-pressed={hidden}
      aria-label={hidden ? 'Show numbers' : 'Hide numbers'}
      title={hidden ? 'Show numbers' : 'Hide numbers'}
      className="inline-flex size-11 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      onClick={() => {
        applyHidden(!hidden, document.documentElement, globalThis.localStorage)
        window.dispatchEvent(new Event(CHANGE))
      }}
    >
      <Icon size={20} aria-hidden />
    </button>
  )
}
