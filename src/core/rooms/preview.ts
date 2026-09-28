/**
 * Одна строчка под именем чата — `MessagePreview` нативной Искры.
 *
 * Сознательно с потерями: вложения становятся «Фото», «Голосовое сообщение» и так далее,
 * а не именем файла, а всё, что показать нельзя, — `undefined`, а не заглушка со словами
 * протокола.
 */
import { EventType, MsgType, type MatrixEvent } from 'matrix-js-sdk';
import type { Preview } from './types';

const POLL_TYPES = new Set(['m.poll.start', 'org.matrix.msc3381.poll.start']);

/** Годится ли событие в превью: сообщения, стикеры, опросы. Служебные — нет. */
export function isPreviewable(event: MatrixEvent): boolean {
  const type = event.getType();
  if (event.isRedacted()) return type === EventType.RoomMessage || type === EventType.Sticker || POLL_TYPES.has(type);
  if (event.isDecryptionFailure()) return true;
  if (type === EventType.RoomMessage) {
    // Правка — не новое сообщение: её текст уже в исходном.
    return event.getRelation()?.rel_type !== 'm.replace';
  }
  return type === EventType.Sticker || POLL_TYPES.has(type);
}

export function previewOf(event: MatrixEvent): Preview | undefined {
  if (event.isRedacted()) return { kind: 'deleted' };
  // Ожидаемо, а не ошибка: устройство вошло позже, чем сообщение ушло, и ключа ему не дали.
  if (event.isDecryptionFailure()) return { kind: 'unreadable' };
  const type = event.getType();
  if (type === EventType.Sticker) return { kind: 'sticker' };
  if (POLL_TYPES.has(type)) return { kind: 'poll' };
  if (type !== EventType.RoomMessage) return undefined;

  // `getContent()` уже учитывает последнюю правку, если SDK её собрал.
  const content = event.getContent<{
    msgtype?: string;
    body?: unknown;
    filename?: unknown;
    info?: unknown;
    'org.matrix.msc3245.voice'?: unknown;
  }>();
  const body = typeof content.body === 'string' ? content.body : '';
  switch (content.msgtype) {
    case MsgType.Text:
    case MsgType.Notice:
    case MsgType.Emote:
      return body ? { kind: 'text', text: body } : undefined;
    case MsgType.Image: {
      // Подпись — если `body` не просто имя файла (MSC2530: `filename` рядом с `body`).
      const caption = typeof content.filename === 'string' && content.filename !== body ? body : undefined;
      return caption ? { kind: 'photo', text: caption } : { kind: 'photo' };
    }
    case MsgType.Video:
      return isVideoNote(content) ? { kind: 'videoNote' } : { kind: 'video' };
    case MsgType.Audio:
      // Голосовое отличается от музыки меткой `voice`, которую ставят другие клиенты.
      return content['org.matrix.msc3245.voice'] !== undefined ? { kind: 'voice' } : { kind: 'audio' };
    case MsgType.File:
      return { kind: 'file' };
    case MsgType.Location:
      return { kind: 'location' };
    default:
      return undefined;
  }
}

/**
 * «Кружочек» узнаётся по форме, как в Искре: ровно квадрат и не длиннее минуты. Обычное
 * `m.video`, никаких своих полей в событии.
 */
export function isVideoNote(content: { info?: unknown }): boolean {
  const info = (content.info ?? {}) as { w?: unknown; h?: unknown; duration?: unknown };
  return (
    typeof info.w === 'number' &&
    info.w > 0 &&
    info.w === info.h &&
    typeof info.duration === 'number' &&
    info.duration <= 60_000
  );
}
