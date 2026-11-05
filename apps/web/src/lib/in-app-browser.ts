/**
 * Apps like Instagram, Facebook, Telegram or Gmail open links in their own built-in browser.
 * Those browsers can't save passkeys on the phone, so they only offer the "another device"
 * QR code. Spot them so we can ask the person to open the link in their real browser.
 */
const IN_APP =
  /FBAN|FBAV|FB_IAB|Instagram|Line\/|LinkedInApp|Twitter|Snapchat|musical_ly|BytedanceWebview|GSA\/|MicroMessenger|Telegram/i

export function isInAppBrowser(userAgent: string, standalone = false): boolean {
  if (IN_APP.test(userAgent)) return true
  // On iPhone and iPad, every real browser adds a "Safari/" token; app web views don't.
  // A home screen web app doesn't either, so it's excluded.
  const ios = /iPhone|iPad|iPod/.test(userAgent)
  return ios && !standalone && !/Safari\//.test(userAgent)
}
