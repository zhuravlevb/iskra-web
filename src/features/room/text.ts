/** Слова ленты: служебные строки, подписи вложений. */
import type { MessageKind, ServiceEvent } from '../../core/timeline/message';
import { t, type TextKey } from '../../i18n/index.svelte.ts';

export function serviceText(event: ServiceEvent): string {
  switch (event.type) {
    case 'joined':
    case 'left':
    case 'invited':
    case 'removed':
    case 'banned':
      return t(`roomEvent.${event.type}`, { name: event.who });
    case 'renamedThemselves':
      return t('roomEvent.renamedThemselves', { from: event.from, to: event.to });
    case 'roomRenamed':
      return t('roomEvent.roomRenamed', { name: event.name });
    default:
      return t(`roomEvent.${event.type}` as TextKey);
  }
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
