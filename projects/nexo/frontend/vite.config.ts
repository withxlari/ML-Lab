import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const origins = [env.VITE_API_BASE_URL, env.VITE_SUPABASE_URL]
    .filter((value): value is string => !!value)
    .map((value) => new URL(value).origin)
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `connect-src 'self' ${origins.join(' ')}`,
    `img-src 'self' data: https://image.tmdb.org https://covers.openlibrary.org https://archive.org https://*.archive.org https://books.google.com https://bookinfo-imagens-prod.s3.amazonaws.com https://media.kitsu.app https://media.kitsu.io https://images.igdb.com ${origins.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
  ].join('; ')
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'nexo-production-csp',
        transformIndexHtml:
          mode === 'production'
            ? () => [
                {
                  tag: 'meta',
                  attrs: {
                    'http-equiv': 'Content-Security-Policy',
                    content: policy,
                  },
                  injectTo: 'head',
                },
              ]
            : undefined,
      },
    ],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/health': 'http://127.0.0.1:8000',
        '/api': 'http://127.0.0.1:8000',
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      restoreMocks: true,
    },
  }
})
