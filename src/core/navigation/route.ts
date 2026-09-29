/**
 * Адрес — настоящий: `/#/room/!id:server`. На десктопе работают «открыть ссылку»,
 * закладка на чат и кнопки мыши «назад/вперёд». Адрес чата не содержит ничего,
 * кроме ID комнаты, — ни текста, ни токенов: история браузера синхронизируется в облако.
 *
 * Hash, а не путь, — чтобы статическому хостингу не нужны были правила перезаписи.
 */
export const settingsSections = ['profile', 'security', 'devices', 'blocked', 'appearance', 'storage', 'about'] as const;
export type SettingsSection = (typeof settingsSections)[number];

export type Route = { name: 'home' } | { name: 'room'; roomId: string } | { name: 'settings'; section?: SettingsSection };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const match = /^\/room\/([^/?#]+)$/.exec(path);
  if (match?.[1]) {
    try {
      const roomId = decodeURIComponent(match[1]);
      if (isRoomId(roomId)) return { name: 'room', roomId };
    } catch {
      // Битая percent-кодировка — это просто неизвестный адрес.
    }
  }
  const settings = /^\/settings(?:\/([a-z]+))?$/.exec(path);
  if (settings) {
    const section = settingsSections.find((name) => name === settings[1]);
    if (!settings[1]) return { name: 'settings' };
    if (section) return { name: 'settings', section };
  }
  return { name: 'home' };
}

export function formatRoute(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'room':
      return `#/room/${encodeURIComponent(route.roomId)}`;
    case 'settings':
      return route.section ? `#/settings/${route.section}` : '#/settings';
  }
}

/** `!opaque:server` — и больше ничего: ни пробелов, ни управляющих символов. */
export function isRoomId(value: string): boolean {
  return /^![^\s:/]+:[^\s/]+$/.test(value);
}
