/**
 * Порядок списка — как в нативной Искре (`RoomListStore.byRecency`): один список, без
 * разделов. Сверху приглашения — единственное, что ждёт ответа (без сообщений они иначе
 * утонули бы на самое дно); под ними закреплённые (`m.favourite`); дальше всё остальное,
 * пространства вместе с чатами, — по последней активности. Архив (низкий приоритет) в общий
 * список не входит: к нему ведёт строка «Архив» над списком.
 */
import { countsTowardsBadge, type RoomSummary } from './types';

export interface Organized {
  /** Всё, что в главном списке, — уже в том порядке, в каком показывать. */
  list: RoomSummary[];
  archived: RoomSummary[];
}

export const byActivity = (a: RoomSummary, b: RoomSummary): number =>
  b.lastActivity - a.lastActivity || a.id.localeCompare(b.id);

/** Приглашения, потом закреплённые, потом остальные; внутри — по активности. */
const rank = (room: RoomSummary): number => (room.membership === 'invite' ? 0 : room.isFavourite ? 1 : 2);

export function organize(rooms: Iterable<RoomSummary>): Organized {
  const list: RoomSummary[] = [];
  const archived: RoomSummary[] = [];
  for (const room of rooms) {
    // Приглашение и пространство в архив не прячутся: первое ждёт ответа, второе — не чат.
    if (room.isLowPriority && room.membership !== 'invite' && room.kind !== 'space') archived.push(room);
    else list.push(room);
  }
  list.sort((a, b) => rank(a) - rank(b) || byActivity(a, b));
  archived.sort(byActivity);
  return { list, archived };
}

/** Число для заголовка вкладки и значка на иконке: чаты, где ждёт что-то для вас. */
export function badgeCount(rooms: Iterable<RoomSummary>): number {
  let count = 0;
  for (const room of rooms) if (room.kind !== 'space' && countsTowardsBadge(room)) count++;
  return count;
}

/** Для сравнения без регистра и диакритики: «Ёлка» находит «елка», «Café» — «cafe». */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ё/g, 'е')
    .replace(/Ё/g, 'Е')
    .toLocaleLowerCase();
}

/**
 * Быстрый переход (`Ctrl/⌘ K`): поиск по названиям — фильтр по памяти, а не запрос к
 * серверу. Сначала совпадение с начала названия, потом с начала слова, потом где угодно;
 * при равенстве — кто живее.
 */
export function searchRooms(rooms: Iterable<RoomSummary>, query: string, nameOf: (room: RoomSummary) => string): RoomSummary[] {
  const q = fold(query.trim());
  const scored: Array<{ room: RoomSummary; score: number }> = [];
  for (const room of rooms) {
    if (room.kind === 'space') continue;
    if (!q) {
      if (room.membership === 'join' && !room.isLowPriority) scored.push({ room, score: 0 });
      continue;
    }
    const name = fold(nameOf(room));
    const at = name.indexOf(q);
    if (at < 0) continue;
    const score = at === 0 ? 0 : /[\s\-_.,:()«"'@]/u.test(name[at - 1] ?? '') ? 1 : 2;
    scored.push({ room, score });
  }
  return scored.sort((a, b) => a.score - b.score || byActivity(a.room, b.room)).map((s) => s.room);
}
