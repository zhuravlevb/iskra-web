/** Мелочи про файлы, общие для ленты, лотка вложений и просмотрщика. */

/** «12 КБ», «3,4 МБ» — единицами языка интерфейса. */
export function fileSize(bytes: number, locale: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit >= 2 ? 1 : 0,
  }).format(value);
}

/**
 * Скачать с исходным именем. Файл уходит в «Загрузки», а не открывается во вкладке:
 * расшифрованный файл по `blob:`-адресу в новой вкладке пережил бы закрытие экрана
 * (см. план, «Медиа»).
 */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name || 'file';
  link.rel = 'noopener';
  link.hidden = true;
  // Ссылка вне документа теряет `download` (браузер берёт имя «download»): на время щелчка —
  // в документ, и сразу обратно.
  document.body.append(link);
  link.click();
  link.remove();
  // Браузер забрал ссылку в момент клика; держать расшифрованное дольше незачем.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Пропорции — для места под картинку до того, как она загрузилась: лента не прыгает. */
export function ratio(width: number | undefined, height: number | undefined, fallback = 4 / 3): number {
  return width && height ? width / height : fallback;
}

/** Действие: пропорции элемента через CSSOM (атрибут `style` строгая CSP не пустит). */
export function aspect(node: HTMLElement, value: number) {
  const set = (v: number) => node.style.setProperty('--ratio', String(v));
  set(value);
  return { update: set };
}
