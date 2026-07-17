// FILE: packages/web/vite.config.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Vite and Vitest configuration for the web frontend
//   SCOPE: Build and test config
//   DEPENDS: none
//   LINKS: M-INFRA-HOSTING
//   ROLE: CONFIG
//   MAP_MODE: NONE
// END_MODULE_CONTRACT

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  envDir: '../../',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 80,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    css: true,
  },
});

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.3 - Remove empty legacy semantic blocks from Convex migration era]
// END_CHANGE_SUMMARY
