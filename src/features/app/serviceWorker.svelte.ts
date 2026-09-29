/**
 * Регистрация service worker'а и «Доступна новая версия».
 *
 * Своя, а не `virtual:pwa-register`: под Trusted Types адрес скрипта SW — это
 * `TrustedScriptURL`, и строкой его не передать. Политика `iskra-sw` пропускает ровно
 * один адрес — наш `sw.js` — и больше ничего.
 *
 * Новая версия ждёт: `skipWaiting` только по нажатию, не сама посреди набора сообщения.
 */
import { Workbox } from 'workbox-window';

/** Скрипт и область SW — от базового пути сборки: на GitHub Pages это `/iskra-web/`. */
const SCOPE = import.meta.env.BASE_URL;
const SW_URL = `${SCOPE}sw.js`;

function scriptUrl(): string | TrustedScriptURL {
  const factory = window.trustedTypes;
  if (!factory) return SW_URL;
  const policy = factory.createPolicy('iskra-sw', {
    createScriptURL: (url) => {
      if (url !== SW_URL) throw new TypeError('Only the Iskra service worker may be registered');
      return url;
    },
  });
  return policy.createScriptURL(SW_URL);
}

class AppUpdate {
  available = $state(false);
  private workbox: Workbox | undefined;

  register(): void {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || this.workbox) return;
    this.workbox = new Workbox(scriptUrl() as string, { scope: SCOPE });
    this.workbox.addEventListener('waiting', () => (this.available = true));
    // Без service worker'а приложение работает, просто без офлайна. Ничего не логируем.
    this.workbox.register().catch(() => {});
  }

  apply(): void {
    const workbox = this.workbox;
    if (!workbox) return;
    workbox.addEventListener('controlling', () => window.location.reload());
    workbox.messageSkipWaiting();
  }
}

export const appUpdate = new AppUpdate();
