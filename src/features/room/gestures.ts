/**
 * Жесты пальца над сообщением — только для касаний: мышь и перо живут по своим правилам.
 *
 * - **Двойное касание** — быстрая реакция, как в нативной Искре.
 * - **Свайп вправо** — ответить. Пузырь едет за пальцем (не дальше порога) и
 *   возвращается; вертикальная прокрутка ленты не перехватывается (`touch-action: pan-y`
 *   у пузыря).
 * - **Долгое нажатие** — меню. Android присылает на него `contextmenu` сам, iOS — нет;
 *   поэтому свой таймер, а `contextmenu` сразу после него гасится (`suppressContextMenu`),
 *   чтобы меню не открылось дважды.
 */

const DOUBLE_TAP_MS = 300;
const TAP_SLOP_PX = 10;
const SWIPE_PX = 64;
const LONG_PRESS_MS = 500;

export interface GestureHandlers {
  ondoubletap: () => void;
  onswipe: () => void;
  onlongpress: (at: { x: number; y: number }) => void;
}

export function touchGestures(node: HTMLElement, handlers: GestureHandlers) {
  let current = handlers;
  let lastTap = 0;
  let start: { x: number; y: number; id: number } | null = null;
  let dx = 0;
  let horizontal = false;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Долгое нажатие уже открыло меню — `contextmenu` следом (Android) лишний. Изначально —
   * «никогда», а не 0: `performance.now()` считается от загрузки страницы, и с нулём первая
   * секунда её жизни глотала любой правый щелчок как «дубль».
   */
  let pressedAt = Number.NEGATIVE_INFINITY;

  const reset = () => {
    clearTimeout(pressTimer);
    node.style.transform = '';
    node.style.transition = '';
    start = null;
    dx = 0;
    horizontal = false;
  };

  const down = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    const at = { x: event.clientX, y: event.clientY };
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      pressedAt = performance.now();
      start = null;
      current.onlongpress(at);
    }, LONG_PRESS_MS);
  };
  const contextmenu = (event: Event) => {
    if (performance.now() - pressedAt < LONG_PRESS_MS * 2) {
      event.preventDefault();
      event.stopImmediatePropagation();
    } else {
      // Android успел первым — свой таймер уже не нужен.
      clearTimeout(pressTimer);
    }
  };
  const move = (event: PointerEvent) => {
    if (!start || event.pointerId !== start.id) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.hypot(x, y) > TAP_SLOP_PX) clearTimeout(pressTimer);
    if (!horizontal && Math.abs(x) > TAP_SLOP_PX && Math.abs(x) > Math.abs(y) * 2 && x > 0) horizontal = true;
    if (!horizontal) return;
    dx = Math.max(0, Math.min(x, SWIPE_PX * 1.25));
    node.style.transition = 'none';
    node.style.transform = `translateX(${dx}px)`;
  };
  const up = (event: PointerEvent) => {
    clearTimeout(pressTimer);
    if (!start || event.pointerId !== start.id) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (horizontal && dx >= SWIPE_PX) current.onswipe();
    else if (!horizontal && moved < TAP_SLOP_PX) {
      const now = event.timeStamp;
      if (now - lastTap < DOUBLE_TAP_MS) {
        lastTap = 0;
        current.ondoubletap();
      } else {
        lastTap = now;
      }
    }
    reset();
  };

  // Раньше обработчика строки: захват, чтобы погасить `contextmenu` до него.
  node.addEventListener('contextmenu', contextmenu, { capture: true });
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', reset);
  return {
    update(next: GestureHandlers) {
      current = next;
    },
    destroy() {
      clearTimeout(pressTimer);
      node.removeEventListener('contextmenu', contextmenu, { capture: true });
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', reset);
    },
  };
}
