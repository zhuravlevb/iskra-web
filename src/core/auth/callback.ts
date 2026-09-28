/**
 * Возврат со страницы входа.
 *
 * Код авторизации стоит столько же, сколько токен, который на него выменивают. В истории
 * браузера — а на десктопе она синхронизируется между устройствами — ему не место, и в
 * логах тоже. Поэтому `readAuthCallback` вызывается в `main.ts` **первой строкой**, до
 * любого другого кода, и сразу стирает параметры из адресной строки `replaceState`.
 *
 * Три вида возврата:
 * - OAuth 2.0: `#code=…&state=…` (по умолчанию `response_mode=fragment`) или `?code=…`;
 *   ошибка — `error=…&state=…`;
 * - legacy SSO: `?loginToken=…`.
 */

export type AuthCallback =
  | { kind: 'oauth'; code: string; state: string }
  | { kind: 'oauth-error'; error: string; state: string | null }
  | { kind: 'sso'; loginToken: string };

export interface CallbackLocation {
  href: string;
}

/** Чистая часть: что пришло и каким должен стать адрес после стирания. */
export function parseAuthCallback(href: string): { callback: AuthCallback | null; cleanUrl: string } {
  const url = new URL(href);
  const query = url.searchParams;
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));

  const pick = (name: string) => query.get(name) ?? fragment.get(name);
  const code = pick('code');
  const state = pick('state');
  const error = pick('error');
  const loginToken = query.get('loginToken');

  let callback: AuthCallback | null = null;
  if (loginToken) callback = { kind: 'sso', loginToken };
  else if (code && state) callback = { kind: 'oauth', code, state };
  else if (error && state) callback = { kind: 'oauth-error', error, state };

  if (!callback) return { callback: null, cleanUrl: href };

  // Стираем всё, что пришло от сервера, целиком: и query, и fragment. Адрес возврата —
  // всегда корень, ничего полезного, кроме параметров, в нём не было.
  return { callback, cleanUrl: `${url.origin}${url.pathname}` };
}

export function readAuthCallback(): AuthCallback | null {
  const { callback, cleanUrl } = parseAuthCallback(window.location.href);
  if (callback) window.history.replaceState(null, '', cleanUrl);
  return callback;
}
