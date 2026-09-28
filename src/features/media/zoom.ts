/**
 * Приближение в просмотрщике — чистая арифметика, отдельно от жестов, чтобы её можно
 * было проверить тестом.
 *
 * Картинка лежит по центру сцены, масштаб `scale`, сдвиг `x/y` — от центра. Приближение
 * «к точке» держит под пальцем или курсором ту же точку картинки, что была до него.
 */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;
export const STEP = 1.5;
export const identity: View = { scale: 1, x: 0, y: 0 };

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/**
 * Новый масштаб так, чтобы точка `(px, py)` (от центра сцены) осталась на месте.
 * На минимальном масштабе сдвига нет: картинка возвращается в центр.
 */
export function zoomAt(view: View, nextScale: number, px: number, py: number): View {
  const scale = clampScale(nextScale);
  if (scale === MIN_SCALE) return identity;
  const k = scale / view.scale;
  return { scale, x: px - (px - view.x) * k, y: py - (py - view.y) * k };
}

/**
 * Сдвиг не дальше, чем нужно, чтобы край картинки дошёл до края сцены: за картинку не
 * утаскивается пустота. `fit` — размер картинки на масштабе 1.
 */
export function clampPan(view: View, fit: { width: number; height: number }, stage: { width: number; height: number }): View {
  const maxX = Math.max(0, (fit.width * view.scale - stage.width) / 2);
  const maxY = Math.max(0, (fit.height * view.scale - stage.height) / 2);
  return { scale: view.scale, x: Math.max(-maxX, Math.min(maxX, view.x)), y: Math.max(-maxY, Math.min(maxY, view.y)) };
}
