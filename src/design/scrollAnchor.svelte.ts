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
  private readonly onScroll = () => this.sync();

  constructor(
    private readonly container: HTMLElement,
    private readonly content: HTMLElement,
    private readonly options: AnchorOptions,
  ) {
    container.style.overflowAnchor = 'none';
    container.addEventListener('scroll', this.onScroll, { passive: true });
    this.observer = new ResizeObserver(() => this.sync());
    this.observer.observe(container);
    this.observer.observe(content);
    this.sync();
  }

  private top(element: Element): number {
    return element.getBoundingClientRect().top - this.container.getBoundingClientRect().top;
  }

  /**
   * Сверка после прокрутки или изменения раскладки. Браузеры присылают их в разном порядке,
   * поэтому правило одно:
   *
   * - прокрутка сдвинулась с тех пор, как якорь её видел, — это человек: запомнить, где он
   *   теперь, и ничего не двигать;
   * - не сдвинулась — это раскладка: внизу — остаться внизу, иначе вернуть якорный элемент
   *   туда, где он был.
   *
   * Свои изменения ленты (подгрузка истории, новое сообщение) экран объявляет заранее —
   * `capture()` до того, как DOM поменяется, — и тогда якорь снят с положения человека, а не
   * с середины перестройки.
   */
  private sync(): void {
    const container = this.container;
    const moved = Math.abs(container.scrollTop - this.seenTop) > 1;
    if (!moved) {
      if (this.stick) {
        container.scrollTop = container.scrollHeight;
      } else if (this.anchorKey) {
        const el = this.content.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(this.anchorKey)}"]`);
        if (el) {
          const shift = this.top(el) - this.anchorOffset;
          if (Math.abs(shift) > 0.5) container.scrollTop += shift;
        }
      }
    }
    this.measure();
  }

  /**
   * Лента сейчас поменяется — запомнить место чтения до перемены. Это та же сверка, а не
   * просто замер: прошлая перемена могла уже лечь в DOM, а наблюдатель — ещё не успеть, и
   * замер без компенсации принял бы сдвинутое положение за правильное.
   */
  capture(): void {
    this.sync();
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
    this.container.scrollTop = this.container.scrollHeight;
    this.measure();
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
