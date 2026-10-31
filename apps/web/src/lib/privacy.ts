export const HIDE_KEY = 'hs-hide-amounts'

/** Runs before paint so hidden numbers never flash. Storage can throw in private modes. */
export const PRIVACY_BOOT_SCRIPT = `try{if(localStorage.getItem('${HIDE_KEY}')==='1')document.documentElement.dataset.hideAmounts=''}catch(e){}`

export function readHidden(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function applyHidden(
  hidden: boolean,
  root: HTMLElement,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined,
): void {
  if (hidden) root.dataset.hideAmounts = ''
  else delete root.dataset.hideAmounts
  try {
    if (hidden) storage?.setItem(HIDE_KEY, '1')
    else storage?.removeItem(HIDE_KEY)
  } catch {
    // Still applies for this visit.
  }
}
