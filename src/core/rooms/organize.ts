/**
 * Разделы списка — как у бета-панели нативной Искры на Mac: приглашения, пространства,
 * закреплённые, остальные. Архив (низкий приоритет) — отдельно, в общий список не входит.
 *
 * Внутри раздела — по последней активности. Раздел — это фильтр, а не пересортировка:
 * самый живой разговор наверху того раздела, куда он попал.
 */
import { countsTowardsBadge, type RoomSummary } from './types';

export interface Sections {
  invitations: RoomSummary[];
  spaces: RoomSummary[];
  pinned: RoomSummary[];
  chats: RoomSummary[];
  archived: RoomSummary[];
}

export const byActivity = (a: RoomSummary, b: RoomSummary): number =>
  b.lastActivity - a.lastActivity || a.id.localeCompare(b.id);

export function organize(rooms: Iterable<RoomSummary>): Sections {
  const sections: Sections = { invitations: [], spaces: [], pinned: [], chats: [], archived: [] };
  for (const room of rooms) {
    if (room.membership === 'invite') sections.invitations.push(room);
    else if (room.kind === 'space') sections.spaces.push(room);
    else if (room.isLowPriority) sections.archived.push(room);
    else if (room.isFavourite) sections.pinned.push(room);
    else sections.chats.push(room);
  }
  for (const list of Object.values(sections)) list.sort(byActivity);
  return sections;
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
