/**
 * Место, как его несёт сообщение, — `Location` нативной Искры. Matrix кладёт координаты в
 * `geo:`-URI (RFC 5870), и этот модуль — оба его конца: что пришло и что уходит.
 *
 * Высота отбрасывается, точность — читается: `;u=35` — это радиус в метрах, и сказать
 * «плюс-минус километр» честнее, чем показать точку.
 */

export interface Place {
  latitude: number;
  longitude: number;
  /** Радиус неуверенности в метрах, если отправитель его сказал. */
  accuracy?: number;
}

/**
 * Прочитать `geo:`. Ничего — если это не место на Земле: сервер перешлёт что угодно, и
 * широта 900 — не место, а неподдерживаемое сообщение.
 */
export function parseGeoUri(uri: string): Place | undefined {
  const match = /^geo:([^;?]*)((?:;[^?]*)?)/i.exec(uri.trim());
  if (!match) return undefined;
  const [lat, lon] = match[1]!.split(',').map(Number);
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  const u = /;u=([\d.]+)/i.exec(match[2] ?? '')?.[1];
  const accuracy = u === undefined ? undefined : Number(u);
  return { latitude: lat, longitude: lon, ...(accuracy !== undefined && Number.isFinite(accuracy) ? { accuracy } : {}) };
}

/** `geo:`, который уходит. Шесть знаков — десять сантиметров: точнее, чем знает любой телефон. */
export function geoUri(place: Place): string {
  const u = place.accuracy !== undefined ? `;u=${Math.round(place.accuracy)}` : '';
  return `geo:${place.latitude.toFixed(6)},${place.longitude.toFixed(6)}${u}`;
}
