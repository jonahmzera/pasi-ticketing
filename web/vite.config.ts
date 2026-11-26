import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: { enabled: false },
      manifest: {
        name: 'Pasi — Events & Tickets',
        short_name: 'Pasi',
        description: 'Find events, pay with M-Pesa, keep your tickets offline and plan with friends. By JMCreations.',
        start_url: '/',
        display: 'standalone',
        background_color: '#05060d',
        theme_color: '#05060d',
        orientation: 'portrait',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        shortcuts: [{ name: 'My tickets', url: '/tickets' }, { name: 'Squads', url: '/squads' }],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src'), '@shared': path.resolve(import.meta.dirname, '../shared/src') } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
