import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/shop',
    name: 'Midnight Market | Fashion After Dark',
    short_name: 'Midnight Market',
    description: 'Discover independent fashion, accessories and looks from Midnight Market boutiques.',
    start_url: '/shop',
    scope: '/',
    display: 'standalone',
    background_color: '#F9F4EC',
    theme_color: '#30203B',
    icons: [
      {
        src: '/pwa-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
