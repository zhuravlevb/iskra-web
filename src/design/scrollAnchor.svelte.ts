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
  /** Где был якорь от верха окна, когда прокрутка стояла на `seenTop`. */
  private anchorOffset = 0;
  private seenTop = 0;
  private readonly observer: ResizeObserver;
  private readonly onScroll = () => this.sync(true);

  constructor(
    private readonly container: HTMLElement,
    private readonly content: HTMLElement,
    private readonly options: AnchorOptions,
  ) {
    container.style.overflowAnchor = 'none';
    container.addEventListener('scroll', this.onScroll, { passive: true });
    this.observer = new ResizeObserver(() => this.sync(false));
    this.observer.observe(container);
    this.observer.observe(content);
    this.sync(false);
  }

  private top(element: Element): number {
    return element.getBoundingClientRect().top - this.container.getBoundingClientRect().top;
  }

  /**
   * Одна сверка на всё — и на прокрутку, и на изменение раскладки, потому что браузеры
   * присылают их в разном порядке: раскладка может поменяться до того, как придёт событие
   * прокрутки, и наоборот.
   *
   * 1. Сдвиг раскладки: где якорь в содержимом сейчас против того, где он был, — эту разницу
   *    прокрутка компенсирует. Прокрутку человека это не трогает: она двигает окно, а не
   *    якорь в содержимом.
   * 2. Внизу и что-то выросло — остаёмся внизу.
   * 3. Запомнить новое положение.
   */
  private sync(fromScroll: boolean): void {
    const container = this.container;
    if (this.stick && !fromScroll) {
      container.scrollTop = container.scrollHeight;
    } else if (this.anchorKey) {
      const el = this.content.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(this.anchorKey)}"]`);
      if (el) {
        const now = container.scrollTop;
        const shift = now + this.top(el) - (this.seenTop + this.anchorOffset);
        if (Math.abs(shift) > 0.5) container.scrollTop = now + shift;
      }
    }
    this.measure();
  }

  private measure(): void {
    const { scrollTop, scrollHeight, clientHeight } = this.container;
    this.seenTop = scrollTop;
    this.stick = scrollHeight - scrollTop - clientHeight <= this.options.bottomReach;
    this.atBottom = this.stick;

    // Первый элемент, чей низ ниже верха окна, — двоичным поиском: их могут быть тысячи.
    const items = this.content.querySelectorAll<HTMLElement>('[data-anchor]');
    const containerTop = this.container.getBoundingClientRect().top;
    let lo = 0;
    let hi = items.length - 1;
    let found: HTMLElement | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const el = items[mid]!;
      if (el.getBoundingClientRect().bottom - containerTop > 0) {
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

  /** «Вниз, к последнему сообщению». */
  scrollToBottom(): void {
    this.stick = true;
    this.sync(false);
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
