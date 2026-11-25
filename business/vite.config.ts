import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// The business system is a separate app on its own address, talking to its own API server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src'), '@shared': path.resolve(import.meta.dirname, '../shared/src') } },
  envDir: path.resolve(import.meta.dirname, '..'), // shares the root .env (only VITE_* values reach the browser)
  server: { port: 5174, proxy: { '/api': 'http://localhost:4100' } },
  preview: { port: 5174 },
});
