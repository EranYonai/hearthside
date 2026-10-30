export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_KEY = 'hs-theme'

/** Runs before paint so a saved theme never flashes. Storage can throw in private modes. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

export function readTheme(storage: Pick<Storage, 'getItem'> | undefined): ThemeChoice {
  try {
    const value = storage?.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(
  choice: ThemeChoice,
  root: HTMLElement,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined,
): void {
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
  try {
    if (choice === 'system') storage?.removeItem(THEME_KEY)
    else storage?.setItem(THEME_KEY, choice)
  } catch {
    // Theme still applies for this visit.
  }
}

export function nextTheme(choice: ThemeChoice): ThemeChoice {
  return choice === 'system' ? 'light' : choice === 'light' ? 'dark' : 'system'
}
