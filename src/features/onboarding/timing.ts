/** Время онбординга — `Theme.Timing` нативной Искры. */

/** Сколько слайд стоит сам, прежде чем уступить следующему. */
export const WELCOME_SLIDE_MS = 5_000;
/** Сколько держится «Привет, …» — это приветствие, а не шаг, и нажимать на нём нечего. */
export const GREETING_MS = 3_000;
/** Пауза между двумя репликами в примере переписки на экране цвета. */
export const PREVIEW_REPLY_MS = 450;
/** Смена шага и появление: `Theme.Timing.stepChanges` и `arrival`. */
export const STEP_MS = 450;
export const ARRIVAL_MS = 320;

/** Человек попросил меньше движения — тогда всё появляется сразу. */
export function motion(ms: number): number {
  if (typeof matchMedia !== 'function') return ms;
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms;
}
