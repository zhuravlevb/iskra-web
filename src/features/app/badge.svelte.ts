/**
 * Заголовок вкладки несёт число чатов, где ждёт что-то для вас, — «(3) Iskra», —
 * и фавиконка получает точку. Во вкладке это единственный способ заметить сообщение, не
 * переключаясь. В установленном окне — ещё и `setAppBadge` на иконке в доке и таскбаре.
 */
const ICON = '/icons/icon.svg';
const ICON_UNREAD = '/icons/icon-unread.svg';

export function titleWith(count: number, appName: string): string {
  return count > 0 ? `(${count}) ${appName}` : appName;
}

export function showBadge(count: number, appName: string): void {
  document.title = titleWith(count, appName);

  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const href = count > 0 ? ICON_UNREAD : ICON;
  if (link && link.getAttribute('href') !== href) link.setAttribute('href', href);

  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  // Не везде есть, и там, где есть, может отказать — значок на иконке это украшение.
  if (count > 0) void nav.setAppBadge?.(count)?.catch(() => {});
  else void nav.clearAppBadge?.()?.catch(() => {});
}
