import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({command,mode}) => {
  // Vite's production bundle must never enable the invitation-only test flow,
  // even when somebody calls vite build directly without npm prebuild.
  if (command === 'build') {
    const flag = loadEnv(mode, process.cwd(), 'VITE_AUTH_TEST_MODE').VITE_AUTH_TEST_MODE;
    if (flag !== undefined && flag !== 'false') {
      throw new Error('Piante release blocked: VITE_AUTH_TEST_MODE must be false');
    }
  }
  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        id: '/app',
        name: 'Piante',
        short_name: 'Piante',
        description: 'Il tuo archivio botanico personale e la tua vetrina pubblica.',
        lang: 'it',
        categories: ['lifestyle', 'utilities'],
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#f5f5ef',
        background_color: '#f5f5ef',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx']
  }
  };
});
