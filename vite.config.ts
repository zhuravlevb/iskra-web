/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { headersFile, securityHeaders } from './security-headers.ts';

/** Кладёт `_headers` со строгой CSP в `dist/` — для статического хостинга. */
function staticHeaders(): Plugin {
  return {
    name: 'iskra:static-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile() });
    },
  };
}

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      // Новая версия не ставится сама посреди набора сообщения: приложение
      // показывает «Доступна новая версия» и перезагружается по нажатию.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon-180.png'],
      manifest: {
        id: '/',
        name: 'Iskra',
        short_name: 'Iskra',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        background_color: '#1c1c1e',
        theme_color: '#8f9933',
        // Повторный запуск из дока фокусирует открытое окно, а не открывает второе.
        // Поддержку по браузерам — проверить (см. план, «Одна вкладка на аккаунт»).
        launch_handler: { client_mode: 'focus-existing' },
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Только оболочка: HTML, JS, CSS, WASM, иконки. Никаких ответов API и медиа —
        // медиа в кэше SW лежало бы расшифрованным.
        globPatterns: ['**/*.{html,js,css,wasm,svg,png,webmanifest}'],
        // Rust-крипто в WASM весит несколько мегабайт.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
    staticHeaders(),
  ],
  server: { headers: securityHeaders(true) },
  preview: { headers: securityHeaders(false) },
  build: {
    target: 'es2022',
    // Никаких inline-стилей и скриптов: CSP без 'unsafe-inline'.
    assetsInlineLimit: 0,
    sourcemap: true,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
