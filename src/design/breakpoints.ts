/**
 * Точки перелома раскладки — по ширине. Как с этим взаимодействовать, решает не ширина,
 * а указатель (см. `viewport.svelte.ts`): это разные оси.
 *
 * Единственное место, где записаны эти числа: `Columns.svelte` получает раскладку
 * из `viewport.svelte.ts`, а не из своих медиа-запросов.
 */
export const breakpoints = {
  /** < 640 — стек: список → чат → лист поверх. */
  twoColumns: 640,
  /** ≥ 1100 — три колонки: список, чат, правая панель. */
  threeColumns: 1100,
} as const;

export type Layout = 'stack' | 'two' | 'three';

export function layoutFor(width: number): Layout {
  if (width >= breakpoints.threeColumns) return 'three';
  if (width >= breakpoints.twoColumns) return 'two';
  return 'stack';
}
