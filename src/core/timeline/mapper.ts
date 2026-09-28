/**
 * `TimelineMapper` — чистая функция из `MatrixEvent` (плюс его связи) в `Message`, как в
 * нативной Искре. Правки, реакции, ответы, удаления, опросы, служебные события — всё
 * разбирается здесь и покрывается тестами на JSON-фикстурах без сети.
 *
 * `undefined` — событие не строка ленты: реакция, правка, редакция, ещё не расшифрованное,
 * служебное, о котором не говорим.
 */
import { EventStatus, EventType, MsgType, type MatrixEvent } from 'matrix-js-sdk';
import { isVideoNote } from '../rooms/preview';
import type { Attachment, Delivery, Message, MessageKind, Reaction, ReplyPreview, SendFailure, ServiceEvent } from './message';

export interface MapperContext {
  ownUserId: string;
  nameOf: (userId: string) => string;
  avatarOf: (userId: string) => string | undefined;
  /** Событие по ID — для цитаты в ответе; `undefined`, если его нет в памяти. */
  eventById: (eventId: string) => MatrixEvent | undefined;
  reactionsOf: (eventId: string) => Reaction[];
  /** Стабильный ключ строки для события. */
  keyOf: (event: MatrixEvent) => string;
}

const POLL_START = new Set(['m.poll.start', 'org.matrix.msc3381.poll.start']);

export function mapEvent(event: MatrixEvent, context: MapperContext): Message | undefined {
  if (event.status === EventStatus.CANCELLED) return undefined;
  const kind = kindOf(event, context);
  if (!kind) return undefined;

  const senderId = event.getSender() ?? '';
  const eventId = event.getId();
  const replyTo = kind.type === 'deleted' ? undefined : replyOf(event, context);
  return {
    key: context.keyOf(event),
    ...(eventId && !eventId.startsWith('~') ? { eventId } : {}),
    kind,
    senderId,
    senderName: context.nameOf(senderId),
    ...(context.avatarOf(senderId) ? { senderAvatarUrl: context.avatarOf(senderId)! } : {}),
    own: senderId === context.ownUserId,
    ts: event.getTs(),
    delivery: deliveryOf(event),
    edited: !!event.replacingEvent() && !event.isRedacted(),
    ...(replyTo ? { replyTo } : {}),
    reactions: eventId && kind.type !== 'deleted' && kind.type !== 'service' ? context.reactionsOf(eventId) : [],
  };
}

function kindOf(event: MatrixEvent, context: MapperContext): MessageKind | undefined {
  const type = event.getType();

  // Связи — не строки: реакция висит под сообщением, правка меняет его текст.
  if (type === EventType.Reaction || type === EventType.RoomRedaction) return undefined;
  if (event.getRelation()?.rel_type === 'm.replace') return undefined;

  if (event.isRedacted()) {
    return isMessageLike(type) ? { type: 'deleted' } : undefined;
  }
  if (event.isDecryptionFailure()) return { type: 'unreadable' };
  // Ещё расшифровывается — покажем, когда расшифруется, а не мигнём «не прочитать».
  if (type === EventType.RoomMessageEncrypted) return undefined;

  if (type === EventType.RoomMessage) return messageKind(event);
  if (type === EventType.Sticker) return { type: 'sticker', attachment: attachmentOf(event.getContent()) };
  if (POLL_START.has(type)) return pollKind(event);
  if (event.isState()) {
    const service = serviceEvent(event, context);
    return service ? { type: 'service', event: service } : undefined;
  }
  return undefined;
}

function isMessageLike(type: string): boolean {
  return type === EventType.RoomMessage || type === EventType.Sticker || POLL_START.has(type) || type === EventType.RoomMessageEncrypted;
}

function messageKind(event: MatrixEvent): MessageKind {
  // `getContent()` уже учитывает последнюю правку.
  const content = event.getContent();
  const body = typeof content['body'] === 'string' ? content['body'] : '';
  const isReply = !!content['m.relates_to']?.['m.in_reply_to'];
  const text = isReply ? stripReplyFallback(body) : body;
  switch (content['msgtype']) {
    case MsgType.Text:
      return { type: 'text', body: text };
    case MsgType.Emote:
      return { type: 'emote', body: text };
    case MsgType.Notice:
      return { type: 'notice', body: text };
    case MsgType.Image:
      return { type: 'image', attachment: attachmentOf(content) };
    case MsgType.Video: {
      const attachment = attachmentOf(content);
      return { type: isVideoNote(content as { info?: unknown }) ? 'videoNote' : 'video', attachment };
    }
    case MsgType.Audio:
      return { type: content['org.matrix.msc3245.voice'] !== undefined ? 'voice' : 'audio', attachment: attachmentOf(content) };
    case MsgType.File:
      return { type: 'file', attachment: attachmentOf(content) };
    case MsgType.Location:
      return { type: 'location', body, uri: typeof content['geo_uri'] === 'string' ? content['geo_uri'] : '' };
    default:
      // Неизвестный msgtype с телом — по спецификации показывается как текст.
      return body ? { type: 'text', body: text } : { type: 'unsupported' };
  }
}

function attachmentOf(content: Record<string, unknown>): Attachment {
  const info = (content['info'] ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const attachment: Attachment = { body: typeof content['body'] === 'string' ? content['body'] : '' };
  if (typeof info['mimetype'] === 'string') attachment.mimetype = info['mimetype'];
  const size = num(info['size']);
  if (size !== undefined) attachment.size = size;
  const w = num(info['w']);
  const h = num(info['h']);
  if (w !== undefined) attachment.width = w;
  if (h !== undefined) attachment.height = h;
  const duration = num(info['duration']);
  if (duration !== undefined) attachment.duration = duration;
  if (typeof content['url'] === 'string') attachment.url = content['url'];
  if (content['file']) attachment.encrypted = true;
  return attachment;
}

function pollKind(event: MatrixEvent): MessageKind {
  const content = event.getContent();
  const poll = (content['m.poll'] ?? content['org.matrix.msc3381.poll.start']) as Record<string, unknown> | undefined;
  const textOf = (value: unknown): string => {
    if (typeof value === 'string') return value;
    const record = value as Record<string, unknown> | undefined;
    const list = (record?.['m.text'] ?? record?.['org.matrix.msc1767.text']) as unknown;
    if (typeof list === 'string') return list;
    if (Array.isArray(list)) return String((list[0] as { body?: unknown })?.body ?? '');
    return '';
  };
  const answers = Array.isArray(poll?.['answers']) ? (poll['answers'] as unknown[]).map(textOf) : [];
  return { type: 'poll', question: textOf(poll?.['question']), answers };
}

function serviceEvent(event: MatrixEvent, context: MapperContext): ServiceEvent | undefined {
  const content = event.getContent();
  const prev = event.getPrevContent();
  switch (event.getType()) {
    case EventType.RoomMember: {
      const target = event.getStateKey() ?? '';
      const name = (typeof content['displayname'] === 'string' && content['displayname']) || context.nameOf(target);
      const was = prev['membership'];
      switch (content['membership']) {
        case 'join':
          if (was === 'join') {
            const from = typeof prev['displayname'] === 'string' ? prev['displayname'] : '';
            // Сменили аватар, а не имя, — не повод для строки в ленте.
            return from && from !== name ? { type: 'renamedThemselves', from, to: name } : undefined;
          }
          return { type: 'joined', who: name };
        case 'invite':
          return { type: 'invited', who: name };
        case 'leave':
          if (was === 'invite' && event.getSender() === target) return undefined; // отказался от приглашения
          return event.getSender() === target ? { type: 'left', who: name } : { type: 'removed', who: name };
        case 'ban':
          return { type: 'banned', who: name };
        default:
          return undefined;
      }
    }
    case EventType.RoomName:
      return typeof content['name'] === 'string' && content['name'] ? { type: 'roomRenamed', name: content['name'] } : undefined;
    case EventType.RoomTopic:
      return { type: 'roomTopicChanged' };
    case EventType.RoomAvatar:
      return { type: 'roomPictureChanged' };
    case EventType.RoomCreate:
      return { type: 'roomCreated' };
    case EventType.RoomEncryption:
      return { type: 'encryptionEnabled' };
    default:
      return undefined;
  }
}

function replyOf(event: MatrixEvent, context: MapperContext): ReplyPreview | undefined {
  const eventId = event.getContent()['m.relates_to']?.['m.in_reply_to']?.event_id ?? event.replyEventId;
  if (typeof eventId !== 'string') return undefined;
  const original = context.eventById(eventId);
  if (!original) return { eventId };
  const sender = original.getSender();
  const content = original.getContent();
  const body = typeof content['body'] === 'string' ? content['body'] : '';
  return {
    eventId,
    ...(sender ? { senderName: context.nameOf(sender) } : {}),
    ...(original.isRedacted() ? {} : { text: stripReplyFallback(body).split('\n')[0] }),
  };
}

function deliveryOf(event: MatrixEvent): Delivery {
  switch (event.status) {
    case EventStatus.NOT_SENT:
      return { state: 'failed', reason: failureOf(event.error) };
    case EventStatus.SENDING:
    case EventStatus.QUEUED:
    case EventStatus.ENCRYPTING:
      return { state: 'sending' };
    default:
      return { state: 'sent' };
  }
}

function failureOf(error: unknown): SendFailure {
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'UnknownDeviceError') return 'insecureDevices';
  if (/identity/i.test(name)) return 'identityChanged';
  return 'server';
}

/**
 * Старые клиенты кладут в начало ответа цитату-подпорку: строки с `> `, потом пустая
 * строка. Показывать её незачем — цитату рисуем сами.
 */
export function stripReplyFallback(body: string): string {
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i]!.startsWith('>')) i++;
  if (i === 0) return body;
  if (lines[i] === '') i++;
  return lines.slice(i).join('\n');
}
