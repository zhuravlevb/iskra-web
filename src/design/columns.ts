/** Ширина списка чатов, rem — Theme.Size.sidebarMinimum / Ideal / Maximum (280 / 320 / 400). */
export const LIST_MIN = 17.5;
export const LIST_IDEAL = 20;
export const LIST_MAX = 25;

/** В допустимые пределы и на сетку в 4 px (0.25rem). */
export function clampListWidth(rem: number): number {
  if (!Number.isFinite(rem)) return LIST_IDEAL;
  return Math.min(LIST_MAX, Math.max(LIST_MIN, Math.round(rem * 4) / 4));
}
