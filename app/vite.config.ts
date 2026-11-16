import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The SDK starts its realtime connection in a worker addressed relative to its own files;
  // pre-bundling moves it into .vite/deps where that worker file does not exist.
  optimizeDeps: { exclude: ['@wyndbase/sdk'] },
  // The SDK's worker code-splits; a production build needs ES module workers (the default IIFE refuses).
  worker: { format: 'es' },
  resolve: {
    alias: {
      // The published SDK imports a subpath @wyndbase/wql does not export; see src/shims/wql-rows.ts.
      '@wyndbase/wql/rows': fileURLToPath(new URL('./src/shims/wql-rows.ts', import.meta.url)),
    },
  },
})