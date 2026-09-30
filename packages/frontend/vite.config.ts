import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Pinned because the backend's CORS_ORIGINS allows exactly this origin. Without
    // strictPort, Vite silently falls back to 5174 when 5173 is taken and every
    // request is then blocked by CORS, with no error in either dev server's output.
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
