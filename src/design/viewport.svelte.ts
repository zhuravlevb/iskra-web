import { breakpoints, type Layout } from './breakpoints';

/**
 * Раскладка и способ ввода — реактивно, из `matchMedia`.
 *
 * Две независимые оси: **ширина** решает, что показать (стек, две колонки, три),
 * **указатель** — как с этим взаимодействовать (кнопки по наведению, размер зон
 * нажатия, что делает `Enter`). Ноутбук с сенсорным экраном широкий, но палец у него
 * тоже есть; планшет с мышью узкий, но наводится.
 */
class Viewport {
  layout = $state<Layout>('stack');
  /** Точный указатель, умеющий наводиться: мышь или трекпад. */
  finePointer = $state(false);

  constructor() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const two = window.matchMedia(`(min-width: ${breakpoints.twoColumns}px)`);
    const three = window.matchMedia(`(min-width: ${breakpoints.threeColumns}px)`);
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => {
      this.layout = three.matches ? 'three' : two.matches ? 'two' : 'stack';
      this.finePointer = fine.matches;
    };
    update();
    for (const query of [two, three, fine]) query.addEventListener('change', update);
  }
}

export const viewport = new Viewport();
