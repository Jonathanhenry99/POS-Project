import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': aplikasi tidak memuat ulang sendiri di tengah transaksi; kasir menekan "Perbarui".
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Mourden POS',
        short_name: 'Mourden POS',
        description: 'Kasir cafe dengan cetak struk satu sentuhan',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        background_color: '#f5f5f4',
        theme_color: '#2b1d16',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5180,
    strictPort: true,
    host: true,
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 400,
  },
});
