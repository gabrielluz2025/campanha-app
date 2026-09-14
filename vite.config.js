import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192.png', 'pwa-512.png', 'apple-touch-icon.png', 'vite.svg'],
      manifest: {
        name: 'Campanha — Materiais e Comando',
        short_name: 'Campanha',
        description: 'Agendar retirada de material e coordenação de campanha',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        id: 'https://campanha.space/',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Nunca substituir estas URLs pelo login/SPA
        navigateFallbackDenylist: [
          /^\/api/,
          /^\/uploads\//,
          /\/iphone\.html/i,
          /\/atalho\.php/i,
          /\/retirada\.html/i,
          /\/verificar\.html/i,
          /\/assinar\.html/i,
          /\/contrato-pdf\.html/i,
          /\.php$/i,
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/uploads/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-uploads-v1',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url }) => /\/retirada\.html$/i.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'retirada-html-v1',
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages-v3',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'assets-v3',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
    {
      name: 'hide-vite-toolbar',
      apply: 'serve',
      transformIndexHtml() {
        return [
          {
            tag: 'style',
            attrs: { type: 'text/css' },
            children: 'vite-dev-tools,vite-error-overlay{display:none!important}',
            injectTo: 'head-prepend',
          },
        ]
      },
    },
  ],
  server: {
    hmr: { overlay: false },
  },
})
