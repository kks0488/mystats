import path from "path"
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = (() => {
    const raw =
      process.env.PORT ||
      env.PORT ||
      process.env.VITE_PORT ||
      env.VITE_PORT ||
      '5178';
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5178;
  })();
  const memuTarget = (
    process.env.MEMU_API_URL ||
    env.MEMU_API_URL ||
    process.env.VITE_MEMU_API_URL ||
    env.VITE_MEMU_API_URL ||
    'http://localhost:8100'
  )
    .trim()
    .replace(/\/+$/, '');

  return {
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
    },
    plugins: [
      react(),
      VitePWA({
        filename: 'sw.js',
        registerType: 'autoUpdate',
        includeAssets: ['logo.svg'],
        manifest: {
          name: 'MyStats',
          short_name: 'MyStats',
          description: 'AI-Powered Self-Discovery & Career Strategy Engine. Transform your scattered thoughts into actionable intelligence.',
          theme_color: '#0A84FF',
          background_color: '#1C1C1E',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/icons/maskable-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,json,txt,woff2}'],
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port,
      proxy: {
        '/api/memu': {
          target: memuTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/memu/, ''),
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('@supabase/')) return 'supabase';
            if (id.includes('@sentry/')) return 'sentry';
            if (id.includes('react-router')) return 'react-router';
            if (id.includes('react-dom') || id.includes('/react/')) return 'react';
            if (id.includes('framer-motion')) return 'motion';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('zod')) return 'zod';
            if (id.includes('idb')) return 'idb';
            return 'vendor';
          },
        },
      },
    },
  };
})
