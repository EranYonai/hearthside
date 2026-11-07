'use client'

import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type ComponentProps, type MouseEvent, useEffect, useRef, useState } from 'react'
import {
  markReset,
  nameOf,
  outsideTrail,
  pageTitle,
  readTrail,
  takeReset,
  type Visit,
  visit,
  writeTrail,
} from '@/lib/back'

const CHANGED = 'hs-trail-change'

/** Keeps the trail of pages up to date. Rendered once, in the app shell. */
export function NavTracker() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const popped = useRef(false)

  useEffect(() => {
    const onPop = () => {
      popped.current = true
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    const url = search ? `${pathname}?${search}` : pathname
    if (outsideTrail(pathname)) {
      // No "Back to Sign in" once you're in.
      writeTrail([])
      window.dispatchEvent(new Event(CHANGED))
      return
    }
    const trail = visit(readTrail(), url, { reset: takeReset(), pop: popped.current })
    popped.current = false
    writeTrail(trail)
    window.dispatchEvent(new Event(CHANGED))
    // The title changes just after the page does; note it for "Back to …" on the next page.
    const timer = setTimeout(() => {
      const now = readTrail()
      const top = now.at(-1)
      const title = pageTitle(document.title)
      if (top?.url === url && title && top.title !== title) {
        writeTrail([...now.slice(0, -1), { ...top, title }])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [pathname, search])

  return null
}

/** A tab bar link: tabs start a fresh trail. */
export function TabLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} onClick={markReset} />
}

/** The page to go back to, and how many history steps away it is (0: navigate instead). */
function previous(trail: readonly Visit[], pathname: string): { prev?: Visit; steps: number } {
  const top = trail.at(-1)
  if (!top) return { steps: 0 }
  const onTop = (top.url.split('?')[0] || '/') === pathname
  if (!onTop) return { prev: top, steps: 0 }
  return { prev: trail.at(-2), steps: top.jump ? 0 : top.steps }
}

/**
 * Back to the page you came from, named after it. Without a trail (opened from a link or after a
 * restart) it goes to `href`, the page's natural parent, or shows nothing when there's none.
 */
export function BackLink({ href, label }: { href?: string; label?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [state, setState] = useState<{ prev?: Visit; steps: number }>({ steps: 0 })

  useEffect(() => {
    const update = () => setState(previous(readTrail(), pathname))
    update()
    window.addEventListener(CHANGED, update)
    return () => window.removeEventListener(CHANGED, update)
  }, [pathname])

  const target = state.prev?.url ?? href
  if (!target) return null
  const pathOf = (url: string) => url.split('?')[0]
  // The page's own name for its parent (an account's name) beats a generic title.
  const name =
    state.prev && !(href && label && pathOf(state.prev.url) === pathOf(href))
      ? nameOf(state.prev)
      : (label ?? 'Back')

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return
    // Read the trail again: an in-page change may have landed since the last render.
    const { prev, steps } = previous(readTrail(), pathname)
    if (!prev) return
    e.preventDefault()
    // Real history keeps the scroll position of the page you return to.
    if (steps > 0 && window.history.length > steps) window.history.go(-steps)
    else router.push(prev.url)
  }

  return (
    <Link
      href={target}
      onClick={onClick}
      aria-label={`Back to ${name}`}
      data-testid="back"
      className="-ms-2 flex min-h-11 min-w-0 items-center gap-0.5 rounded-md pe-2 text-body-strong text-brand-ink transition-opacity active:opacity-60 focus-visible:outline-2 focus-visible:outline-focus"
    >
      <ChevronLeft size={24} strokeWidth={2} aria-hidden className="shrink-0 rtl:rotate-180" />
      <span className="truncate">{name}</span>
    </Link>
  )
}
