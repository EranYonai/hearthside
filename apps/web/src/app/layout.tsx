import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { PRIVACY_BOOT_SCRIPT } from '@/lib/privacy'
import { THEME_BOOT_SCRIPT } from '@/lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hearthside',
  description: 'One home, one clear picture.',
  applicationName: 'Hearthside',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Hearthside', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '48x48' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf7ee' },
    { media: '(prefers-color-scheme: dark)', color: '#141821' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT + PRIVACY_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
