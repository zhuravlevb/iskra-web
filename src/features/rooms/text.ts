/** Слова для строки списка: превью, имя, фраза для скринридера. */
import { hasUnread, type Preview, type RoomSummary } from '../../core/rooms/types';
import { plural, t, type TextKey } from '../../i18n/index.svelte.ts';

export function roomName(room: RoomSummary): string {
  return room.name ?? t('room.untitled');
}

export function previewText(preview: Preview | undefined): string {
  if (!preview) return '';
  if (preview.kind === 'text') return preview.text;
  if (preview.text) return preview.text;
  return t(`preview.${preview.kind}` as TextKey);
}

/**
 * Одна фраза на строку — чтобы скринридер читал мысль, а не кучу обрывков. И оба числа,
 * если есть оба: «12 непрочитанных, 1 упоминание вас», а не одно вместо другого.
 */
export function rowLabel(room: RoomSummary): string {
  const parts = [roomName(room)];
  if (room.encrypted) parts.push(t('roomList.privateChat'));
  if (room.isFavourite) parts.push(t('roomList.pinned'));
  const preview = previewText(room.preview);
  if (preview) parts.push(preview);
  if (room.unreadCount > 0) parts.push(plural('roomList.unread', room.unreadCount));
  else if (hasUnread(room)) parts.push(t('roomList.hasUnread'));
  if (room.mentionCount > 0) parts.push(plural('roomList.mentions', room.mentionCount));
  return parts.join(', ');
}
