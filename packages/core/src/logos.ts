/**
 * Built-in logos, served from apps/web/public/logos. Where each file came from is listed in
 * apps/web/public/logos/SOURCES.md. Ids are brand ids (see brands.ts) or card networks.
 */
export const LOGO_FILES: Readonly<Record<string, string>> = {
  altshuler: 'altshuler.png',
  amex: 'amex.svg',
  analyst: 'analyst.svg',
  cal: 'cal.svg',
  clal: 'clal.svg',
  diners: 'diners.svg',
  discount: 'discount.svg',
  etoro: 'etoro.svg',
  fibi: 'fibi.svg',
  hapoalim: 'hapoalim.svg',
  harel: 'harel.svg',
  ibi: 'ibi.svg',
  ibkr: 'ibkr.svg',
  isracard: 'isracard.svg',
  jerusalem: 'jerusalem.svg',
  leumi: 'leumi.svg',
  mastercard: 'mastercard.svg',
  max: 'max.svg',
  meitav: 'meitav.svg',
  mercantile: 'mercantile.png',
  migdal: 'migdal.svg',
  mizrahi: 'mizrahi.svg',
  more: 'more.svg',
  onezero: 'onezero.svg',
  phoenix: 'phoenix.svg',
  psagot: 'psagot.svg',
  schwab: 'schwab.svg',
  visa: 'visa.svg',
  yahav: 'yahav.svg',
}

/** Path of the built-in logo for a brand or card network, if there is one. */
export function logoPath(id: string | null | undefined): string | null {
  return id && Object.hasOwn(LOGO_FILES, id) ? `/logos/${LOGO_FILES[id]}` : null
}
