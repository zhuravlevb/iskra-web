/**
 * Фото из `mxc://` для лиц: загружается с токеном через сессию и отдаётся object URL.
 * Реактивная обёртка — чтобы компонент просто читал `photo.url`.
 */
import type { UserSession } from '../../core/session/userSession.svelte.ts';

/** Сколько пикселей просить: размер круга × плотность экрана. */
export function pixelsFor(rem: number): number {
  const root = typeof document === 'undefined' ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.ceil(rem * root * dpr);
}

export class Photo {
  url = $state<string | undefined>(undefined);

  constructor(session: UserSession, mxc: string | undefined, sizePx: number) {
    if (!mxc) return;
    void session.thumbnails.load(mxc, sizePx).then((url) => (this.url = url));
  }
}
