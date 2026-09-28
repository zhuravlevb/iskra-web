/**
 * Метка времени в строке списка — `RoomTimestamp` нативной Искры:
 *
 * - сегодня — время («14:05»);
 * - вчера — «Вчера»;
 * - на этой неделе (до шести дней назад) — день недели («вт»): при семи «вторник» мог бы
 *   значить и этот вторник, и прошлый;
 * - раньше — дата цифрами («12.07.25»), в форме, привычной языку.
 *
 * Дни считаются от полуночи до полуночи, а не часами: «пятница» или «08.07» не может
 * зависеть от того, в какое время суток ушло сообщение.
 */
export function roomTimestamp(ts: number, now: number, locale: string, yesterday: string): string {
  const date = new Date(ts);
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  if (days === 1) return yesterday;
  if (days <= 6) return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
