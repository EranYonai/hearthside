import { describe, expect, it } from 'vitest'
import { isInAppBrowser } from './in-app-browser'

const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'
const WEBVIEW =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const INSTAGRAM = `${WEBVIEW} Instagram 300.0.0`
const ANDROID_FB =
  'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0]'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

describe('isInAppBrowser', () => {
  it('lets real browsers through', () => {
    expect(isInAppBrowser(SAFARI)).toBe(false)
    expect(isInAppBrowser(CHROME_IOS)).toBe(false)
    expect(isInAppBrowser(ANDROID_CHROME)).toBe(false)
  })

  it('spots app web views', () => {
    expect(isInAppBrowser(WEBVIEW)).toBe(true)
    expect(isInAppBrowser(INSTAGRAM)).toBe(true)
    expect(isInAppBrowser(ANDROID_FB)).toBe(true)
  })

  it('trusts a home screen web app', () => {
    expect(isInAppBrowser(WEBVIEW, true)).toBe(false)
  })
})
