/** Слова ленты: служебные строки, подписи вложений. */
import type { MessageKind, ServiceEvent } from '../../core/timeline/message';
import { plural, t, type TextKey } from '../../i18n/index.svelte.ts';

export function serviceText(event: ServiceEvent): string {
  switch (event.type) {
    case 'joined':
    case 'left':
    case 'invited':
    case 'removed':
    case 'banned':
      return t(`roomEvent.${event.type}`, { name: people(event.people) });
    case 'renamedThemselves':
      return t('roomEvent.renamedThemselves', { from: event.from, to: event.to });
    case 'roomRenamed':
      return t('roomEvent.roomRenamed', { name: event.name });
    default:
      return t(`roomEvent.${event.type}` as TextKey);
  }
}

/**
 * Люди в служебной строке — насколько их стоит называть: один — имя, двое — оба, трое и
 * больше — первое имя и число. Строка на одиннадцать имён — уже абзац, и его не читают.
 */
export function people(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return t('roomEvent.pair', { first: names[0]!, second: names[1]! });
  return plural('roomEvent.others', names.length - 1, { name: names[0]! });
}

/** Кто печатает — одной строкой. */
export function typingText(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return t('room.typingBy', { name: names[0]! });
  if (names.length === 2) return t('room.typingPair', { first: names[0]!, second: names[1]! });
  return t('room.typingSeveral');
}

/** Что написать вместо вложения, пока нет медиа (этап 7). */
export function attachmentLabel(kind: MessageKind): string {
  switch (kind.type) {
    case 'image':
    case 'video':
    case 'videoNote':
    case 'voice':
    case 'audio':
    case 'file':
    case 'sticker':
      return t(`preview.${kind.type === 'image' ? 'photo' : kind.type}` as TextKey);
    case 'location':
      return t('preview.location');
    default:
      return '';
  }
}
