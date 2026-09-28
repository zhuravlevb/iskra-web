/**
 * Прокрутка ленты без прыжков.
 *
 * Самое трудное место UI (см. план, «Лента»): элементы разной высоты, новые приходят снизу,
 * история подгружается сверху, и **ширина окна меняется** — строки переносятся, высота
 * каждого пузыря другая. Решение — якорь на элементе, который сейчас на экране:
 *
 * - при каждой прокрутке запоминаем верхний видимый элемент (`data-anchor`) и его отступ
 *   от верха окна;
 * - при любом изменении высоты содержимого или окна (`ResizeObserver` срабатывает после
 *   раскладки и до отрисовки) возвращаем этот элемент на тот же отступ;
 * - если человек был внизу — остаёмся внизу: новое сообщение не должно уезжать под край.
 *
 * Свой якорь, а не `overflow-anchor` браузера: тот в Safari появился поздно и ведёт себя
 * по-разному в трёх движках, а место чтения должно быть одним и тем же везде.
 */

export interface AnchorOptions {
  /** Сколько пикселей от верха — уже «пора просить историю». */
  topReach: number;
  /** Сколько пикселей от низа — ещё «внизу». Theme.Size.newestReach — 80. */
  bottomReach: number;
  onNearTop: () => void;
}

export class ScrollAnchor {
  /** Человек внизу ленты: новое показываем, прочитанным отмечаем. */
  atBottom = $state(true);

  private stick = true;
  private anchorKey: string | null = null;
  private anchorOffset = 0;
  private restoring = false;
  private readonly observer: ResizeObserver;
  private readonly onScroll = () => this.record();

  constructor(
    private readonly container: HTMLElement,
    private readonly content: HTMLElement,
    private readonly options: AnchorOptions,
  ) {
    container.style.overflowAnchor = 'none';
    container.addEventListener('scroll', this.onScroll, { passive: true });
    this.observer = new ResizeObserver(() => this.restore());
    this.observer.observe(container);
    this.observer.observe(content);
    this.restore();
  }

  private top(element: Element): number {
    return element.getBoundingClientRect().top - this.container.getBoundingClientRect().top;
  }

  private record(): void {
    if (this.restoring) {
      this.restoring = false;
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = this.container;
    this.stick = scrollHeight - scrollTop - clientHeight <= this.options.bottomReach;
    this.atBottom = this.stick;

    // Первый элемент, чей низ ниже верха окна, — двоичным поиском: их могут быть тысячи.
    const items = this.content.querySelectorAll<HTMLElement>('[data-anchor]');
    let lo = 0;
    let hi = items.length - 1;
    let found: HTMLElement | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const el = items[mid]!;
      const rect = el.getBoundingClientRect();
      if (rect.bottom - this.container.getBoundingClientRect().top > 0) {
        found = el;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    if (found) {
      this.anchorKey = found.dataset['anchor'] ?? null;
      this.anchorOffset = this.top(found);
    }

    if (scrollTop <= this.options.topReach) this.options.onNearTop();
  }

  /** Вернуть место чтения после любого изменения раскладки. */
  restore(): void {
    const before = this.container.scrollTop;
    if (this.stick) {
      this.container.scrollTop = this.container.scrollHeight;
    } else if (this.anchorKey) {
      const el = this.content.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(this.anchorKey)}"]`);
      if (el) this.container.scrollTop += this.top(el) - this.anchorOffset;
    }
    // Своя прокрутка не должна переписать якорь промежуточным положением.
    if (this.container.scrollTop !== before) this.restoring = true;
  }

  /** «Вниз, к последнему сообщению». */
  scrollToBottom(): void {
    this.stick = true;
    this.atBottom = true;
    this.restore();
  }

  /** Сколько содержимого — меньше ли окна (плюс запас): тогда нужна ещё история. */
  needsMore(): boolean {
    return this.content.scrollHeight <= this.container.clientHeight + this.options.topReach;
  }

  destroy(): void {
    this.container.removeEventListener('scroll', this.onScroll);
    this.observer.disconnect();
  }
}
