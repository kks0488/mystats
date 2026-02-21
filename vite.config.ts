import path from "path"
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function resolveVendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  const normalized = id.replace(/\\/g, '/');

  if (normalized.includes('/node_modules/react/') || normalized.includes('/node_modules/react-dom/')) {
    return 'vendor-react';
  }
  if (normalized.includes('/node_modules/react-router/') || normalized.includes('/node_modules/react-router-dom/')) {
    return 'vendor-router';
  }
  if (normalized.includes('/node_modules/framer-motion/')) {
    return 'vendor-motion';
  }
  if (
    normalized.includes('/node_modules/react-markdown/') ||
    normalized.includes('/node_modules/micromark/') ||
    normalized.includes('/node_modules/mdast-') ||
    normalized.includes('/node_modules/hast-') ||
    normalized.includes('/node_modules/remark-') ||
    normalized.includes('/node_modules/rehype-') ||
    normalized.includes('/node_modules/unified/') ||
    normalized.includes('/node_modules/vfile/')
  ) {
    return 'vendor-markdown';
  }
  if (
    normalized.includes('/node_modules/@supabase/') ||
    normalized.includes('/node_modules/@google/generative-ai/')
  ) {
    return 'vendor-ai-data';
  }
  if (normalized.includes('/node_modules/@radix-ui/') || normalized.includes('/node_modules/lucide-react/')) {
    return 'vendor-ui';
  }
  if (normalized.includes('/node_modules/zod/')) {
    return 'vendor-zod';
  }
  return 'vendor-misc';
}

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
            return resolveVendorChunk(id);
          },
        },
      },
    },
  };
})
