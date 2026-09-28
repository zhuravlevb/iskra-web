/**
 * Заголовки безопасности — единственный источник.
 *
 * Отсюда их берут и dev-сервер Vite, и `vite preview`, и файл `_headers`,
 * который сборка кладёт в `dist/` для статического хостинга. CSP отдаётся
 * заголовком, а не `<meta>`: `frame-ancestors` в `<meta>` не работает.
 *
 * Граница безопасности веб-клиента — CSP (см. план, «Безопасность»).
 */

/**
 * `connect-src https:` — сознательный компромисс: homeserver человек вводит
 * сам, заранее список не составить. Всё остальное закрыто.
 */
function csp(dev: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // wasm-unsafe-eval — Rust-крипто matrix-js-sdk, собранное в WASM.
    'script-src': ["'self'", "'wasm-unsafe-eval'"],
    // В dev Vite вставляет стили тегами <style> из JS; в сборке CSS — файлами.
    'style-src': dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    'img-src': ["'self'", 'blob:', 'data:'],
    'media-src': ["'self'", 'blob:'],
    'font-src': ["'self'"],
    'connect-src': dev ? ["'self'", 'https:', 'ws:'] : ["'self'", 'https:'],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  if (!dev) {
    // Trusted Types: Svelte заводит политику `svelte-trusted-html`, DOMPurify —
    // `dompurify`, регистрация SW — `iskra-sw` (пропускает только /sw.js). Больше
    // никому писать в опасные синки нельзя. В dev выключено: оверлей
    // ошибок Vite пишет в innerHTML сам.
    directives['require-trusted-types-for'] = ["'script'"];
    directives['trusted-types'] = ['svelte-trusted-html', 'dompurify', 'iskra-sw'];
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

export function securityHeaders(dev: boolean): Record<string, string> {
  return {
    'Content-Security-Policy': csp(dev),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy':
      'camera=(self), microphone=(self), geolocation=(self), display-capture=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

/** Формат `_headers` (Netlify, Cloudflare Pages). */
export function headersFile(): string {
  const lines = ['/*'];
  for (const [name, value] of Object.entries(securityHeaders(false))) {
    lines.push(`  ${name}: ${value}`);
  }
  return lines.join('\n') + '\n';
}
