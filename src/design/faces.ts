/**
 * Лица: существо-blobatar или инициалы.
 *
 * blobatar — оригинальный пакет (MIT), а не перевод Swift-порта обратно в JS: так
 * совпадение с нативной Искрой и с остальным миром гарантировано конструкцией. Тест
 * держит его на том же golden-файле, что `BlobatarTests` нативной Искры.
 *
 * Сид — идентификатор (Matrix ID или ID комнаты), никогда не имя: имя меняют, а лицо,
 * которое меняется, когда человек правит профиль, — не лицо. И никогда не
 * `blobatar.dev/avatar/<seed>`: это список всех собеседников, отправленный третьей стороне.
 */
import { blobatar } from 'blobatar';

/**
 * Насколько существо увеличено в своём квадрате — как `BlobatarView.fill` нативной Искры:
 * тело blobatar — около трёх четвертей коробки, и без увеличения в круге аватара остаётся
 * пятнышко. Не больше 1.16 и не больше, чем помещается: край фигуры не должен уйти за рамку.
 */
export const CREATURE_FILL = 1.16;

/**
 * Габариты фигуры в её коробке 100×100 — по всем точкам путей, включая контрольные, и по
 * кругам. Ровно так считает `CGPath.boundingBox` в нативной Искре, поэтому и увеличение
 * выходит то же самое.
 */
export function creatureBounds(markup: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const [, cx, cy, r] of markup.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"/g)) {
    const x = Number(cx);
    const y = Number(cy);
    const radius = Number(r);
    add(x - radius, y - radius);
    add(x + radius, y + radius);
  }

  for (const [, d] of markup.matchAll(/ d="([^"]+)"/g)) {
    let x = 0;
    let y = 0;
    for (const [, command, args] of d!.matchAll(/([MLCQHVZ])([^MLCQHVZ]*)/g)) {
      const n = args!.trim() ? args!.trim().split(/[\s,]+/).map(Number) : [];
      switch (command) {
        case 'H':
          for (const v of n) add((x = v), y);
          break;
        case 'V':
          for (const v of n) add(x, (y = v));
          break;
        case 'Z':
          break;
        default:
          for (let i = 0; i + 1 < n.length; i += 2) {
            x = n[i]!;
            y = n[i + 1]!;
            add(x, y);
          }
      }
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** `magnification(upTo:)` нативной Искры: до какого размера можно вырастить фигуру из центра. */
export function magnification(markup: string, ceiling = CREATURE_FILL): number {
  const box = creatureBounds(markup);
  if (!box) return 1;
  const reach = Math.max(50 - box.minX, 50 - box.minY, box.maxX - 50, box.maxY - 50);
  if (reach <= 0) return 1;
  return Math.min(ceiling, 50 / reach);
}

const cache = new Map<string, string>();
const CACHE_LIMIT = 512;

/**
 * Существо для `<img src>`: data-URI (CSP разрешает `img-src data:`), уже увеличенное —
 * через `viewBox`, из центра. SVG в `<img>` — изолированный документ: ни скрипта, ни
 * запроса наружу, ни прохода через Trusted Types.
 */
export function creatureUri(seed: string): string {
  const hit = cache.get(seed);
  if (hit) return hit;
  const markup = blobatar(seed);
  const m = magnification(markup);
  const side = 100 / m;
  const origin = 50 - side / 2;
  const grown = markup.replace('viewBox="0 0 100 100"', `viewBox="${round(origin)} ${round(origin)} ${round(side)} ${round(side)}"`);
  const uri = `data:image/svg+xml,${encodeURIComponent(grown)}`;
  cache.set(seed, uri);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return uri;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Инициалы — как в нативной Искре: первые буквы двух слов, начинающихся с буквы или цифры.
 * «Тарас (работа)» — «ТР», а не «Т(»: скобка крупным кеглем читается как ошибка.
 */
export function initialsOf(name: string): string {
  const words = name
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
    .slice(0, 2);
  const letters = words.map((word) => [...word][0]!).join('').toLocaleUpperCase();
  if (letters) return letters;
  const first = [...name.trim()][0];
  return first ? first.toLocaleUpperCase() : '';
}
