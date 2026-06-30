import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  build: {
    assetsDir: 'assets',
    rollupOptions: { output: { entryFileNames: 'assets/[name]-[hash].js', chunkFileNames: 'assets/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' } },
  },
  plugins: [
    react(),
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
