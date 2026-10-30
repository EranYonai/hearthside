'use client'

import { Button } from '@hearthside/ui'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { applyTheme, nextTheme, readTheme, type ThemeChoice } from './theme'

const LABELS: Record<ThemeChoice, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
}
const ICONS = { system: Monitor, light: Sun, dark: Moon }
const CHANGE = 'hs-theme-change'

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE, onChange)
  }
}

export function ThemeToggle() {
  const choice = useSyncExternalStore(
    subscribe,
    () => readTheme(globalThis.localStorage),
    () => 'system' as const,
  )
  const Icon = ICONS[choice]
  return (
    <Button
      variant="secondary"
      icon={<Icon aria-hidden />}
      onClick={() => {
        applyTheme(nextTheme(choice), document.documentElement, globalThis.localStorage)
        window.dispatchEvent(new Event(CHANGE))
      }}
    >
      {LABELS[choice]}
    </Button>
  )
}
