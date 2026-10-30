import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hearthside',
    short_name: 'Hearthside',
    description: 'One home, one clear picture.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fbf7ee',
    theme_color: '#fbf7ee',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
