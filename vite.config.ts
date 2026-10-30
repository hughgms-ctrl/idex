import { fileURLToPath, URL } from 'node:url'

import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// `pnpm dev:phone` usa o modo "phone": expõe na rede (--host) com HTTPS
// autoassinado, para abrir no celular na mesma rede Wi-Fi.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'phone' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'ide.x',
        short_name: 'ide.x',
        description: 'Escala, repertório e presença do ministério de louvor',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0e0f12',
        background_color: '#0e0f12',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['**/*.woff'],
        navigateFallback: '/index.html',
        // aviso no celular (Web Push): public/push-sw.js
        importScripts: ['push-sw.js'],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    // Libera endereços do túnel (cloudflared) para testar no celular com HTTPS válido
    allowedHosts: ['.trycloudflare.com'],
    // Repasse para o Supabase local: o celular (ou o túnel) acessa tudo pelo
    // mesmo endereço do app, em /__supabase. Ver src/lib/env.ts.
    proxy: {
      '/__supabase': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__supabase/, ''),
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Bibliotecas em blocos separados: mudam pouco e ficam no cache do celular
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
            },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            // bibliotecas só de algumas telas (cifra, QR, áudio) ficam nos blocos delas
            {
              name: 'vendor',
              test: /^(?!.*[\\/]node_modules[\\/](signalsmith-stretch|chordsheetjs|qr-scanner|qrcode)[\\/]).*[\\/]node_modules[\\/]/,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@domain': fileURLToPath(new URL('./supabase/functions/_shared/domain', import.meta.url)),
    },
  },
}))
