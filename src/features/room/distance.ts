/** Расстояние словами языка: «35 м», «1,2 км». Метры точнее сотни — ложная точность. */
export function distance(meters: number, locale: string): string {
  if (meters < 1000) {
    const rounded = meters < 100 ? Math.max(1, Math.round(meters)) : Math.round(meters / 10) * 10;
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'meter', unitDisplay: 'short' }).format(rounded);
  }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilometer', unitDisplay: 'short', maximumFractionDigits: 1 }).format(meters / 1000);
}
