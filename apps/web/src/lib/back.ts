/**
 * The trail of pages this tab went through, so a back button can return to where you came from
 * (Accounts, Home, a holding's account) instead of a fixed parent page.
 *
 * Each entry is one page. Moving within a page (a new month, range or filter) updates its entry
 * and counts the extra history step, so going back skips those steps and lands on the page before.
 */
export interface Visit {
  /** Path and query, e.g. `/transactions?account=abc`. */
  url: string
  /** History steps spent on this page (1, plus one per in-page change). */
  steps: number
  /** The page's own name, from its title, when known. */
  title?: string
  /**
   * Reached by a link to a page already on the trail rather than by going back, so the browser
   * history no longer matches the trail: its back button navigates instead of stepping back.
   */
  jump?: boolean
}

export const MAX_TRAIL = 30

const pathOf = (url: string) => url.split(/[?#]/)[0] || '/'

/** Where the trail goes after the tab shows `url`. `pop` is a browser back or forward. */
export function visit(
  trail: readonly Visit[],
  url: string,
  { reset = false, pop = false }: { reset?: boolean; pop?: boolean } = {},
): Visit[] {
  const top = trail.at(-1)
  if (reset || !top) return [{ url, steps: 1 }]
  if (top.url === url) return [...trail]
  const path = pathOf(url)
  if (pathOf(top.url) === path) {
    const steps = pop ? Math.max(1, top.steps - 1) : top.steps + 1
    return [...trail.slice(0, -1), { ...top, url, steps }]
  }
  // Back to a page already on the trail (the one underneath, by the back button or the browser,
  // or one further down): cut the trail there so it never loops.
  const at = trail.findLastIndex((v) => pathOf(v.url) === path)
  if (at >= 0) {
    const back: Visit = { ...trail[at]!, url }
    delete back.jump
    return [...trail.slice(0, at), pop ? back : { ...back, steps: 1, jump: true }]
  }
  return [...trail, { url, steps: 1 }].slice(-MAX_TRAIL)
}

const NAMES: Record<string, string> = {
  '/': 'Home',
  '/accounts': 'Accounts',
  '/transactions': 'Activity',
  '/invest': 'Investments',
  '/invest/trends': 'Trends',
  '/invest/checkup': 'Check-up',
  '/settings': 'Settings',
  '/import': 'Import',
  '/recurring': 'Fixed costs',
}

/** A short name for a page, for "Back to …". */
export function nameOf(v: Pick<Visit, 'url' | 'title'>): string {
  return NAMES[pathOf(v.url)] ?? v.title ?? 'Back'
}

/** "Fixed costs · Hearthside" → "Fixed costs". */
export function pageTitle(documentTitle: string): string | undefined {
  const name = documentTitle.replace(/\s*·\s*Hearthside$/, '').trim()
  return name && name !== 'Hearthside' ? name : undefined
}

const KEY = 'hs-trail'
const RESET_KEY = 'hs-trail-reset'

export function readTrail(): Visit[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((v) => typeof v?.url === 'string') : []
  } catch {
    return []
  }
}

export function writeTrail(trail: readonly Visit[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail))
  } catch {
    // Private mode or storage off: back buttons fall back to the parent page.
  }
}

/** The tab bar starts a fresh trail: a tab is a top-level place. */
export function markReset() {
  try {
    sessionStorage.setItem(RESET_KEY, '1')
  } catch {
    // ignore
  }
}

export function takeReset(): boolean {
  try {
    const on = sessionStorage.getItem(RESET_KEY) === '1'
    sessionStorage.removeItem(RESET_KEY)
    return on
  } catch {
    return false
  }
}
