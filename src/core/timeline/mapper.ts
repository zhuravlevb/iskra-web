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
import { parseGeoUri } from './location';
import type { Attachment, Delivery, EncryptedFileKey, MediaSource, Message, MessageKind, Poll, Reaction, ReplyPreview, SendFailure, ServiceEvent } from './message';

export interface MapperContext {
  ownUserId: string;
  nameOf: (userId: string) => string;
  avatarOf: (userId: string) => string | undefined;
  /** Событие по ID — для цитаты в ответе; `undefined`, если его нет в памяти. */
  eventById: (eventId: string) => MatrixEvent | undefined;
  reactionsOf: (eventId: string) => Reaction[];
  /** Стабильный ключ строки для события. */
  keyOf: (event: MatrixEvent) => string;
  /** Связанные события: ответы и конец опроса (`m.reference`). */
  relationsOf: (eventId: string, relType: string, eventTypes: readonly string[]) => MatrixEvent[];
  isPinned: (eventId: string) => boolean;
  /** Может ли этот человек удалить *чужое* событие — право модератора. */
  canRedactOthers: (event: MatrixEvent) => boolean;
  /** Заблокирован ли отправитель: его сообщений не видно, служебные строки о нём — видно. */
  isBlocked: (userId: string) => boolean;
}

const POLL_START = new Set(['m.poll.start', 'org.matrix.msc3381.poll.start']);
export const POLL_RESPONSE = ['m.poll.response', 'org.matrix.msc3381.poll.response'] as const;
export const POLL_END = ['m.poll.end', 'org.matrix.msc3381.poll.end'] as const;
const HTML_FORMAT = 'org.matrix.custom.html';

export function mapEvent(event: MatrixEvent, context: MapperContext): Message | undefined {
  if (event.status === EventStatus.CANCELLED) return undefined;
  const kind = kindOf(event, context);
  if (!kind) return undefined;

  const senderId = event.getSender() ?? '';
  if (kind.type !== 'service' && senderId !== context.ownUserId && context.isBlocked(senderId)) return undefined;
  const rawId = event.getId();
  const eventId = rawId && !rawId.startsWith('~') ? rawId : undefined;
  const replyTo = kind.type === 'deleted' ? undefined : replyOf(event, context);
  const own = senderId === context.ownUserId;
  const delivery = deliveryOf(event);
  const live = kind.type !== 'deleted' && kind.type !== 'service';
  return {
    key: context.keyOf(event),
    ...(eventId ? { eventId } : {}),
    kind,
    senderId,
    senderName: context.nameOf(senderId),
    ...(context.avatarOf(senderId) ? { senderAvatarUrl: context.avatarOf(senderId)! } : {}),
    own,
    ts: event.getTs(),
    delivery,
    edited: !!event.replacingEvent() && !event.isRedacted(),
    ...(replyTo ? { replyTo } : {}),
    reactions: eventId && live ? context.reactionsOf(eventId) : [],
    pinned: !!eventId && live && context.isPinned(eventId),
    canEdit: own && !!eventId && delivery.state === 'sent' && (kind.type === 'text' || kind.type === 'emote' || kind.type === 'notice'),
    canDelete: !!eventId && live && (own || context.canRedactOthers(event)),
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
  if (POLL_START.has(type)) return { type: 'poll', poll: pollOf(event, context) };
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
  const html = content['format'] === HTML_FORMAT && typeof content['formatted_body'] === 'string' ? content['formatted_body'] : undefined;
  const withHtml = html ? { html } : {};
  switch (content['msgtype']) {
    case MsgType.Text:
      return { type: 'text', body: text, ...withHtml };
    case MsgType.Emote:
      return { type: 'emote', body: text, ...withHtml };
    case MsgType.Notice:
      return { type: 'notice', body: text, ...withHtml };
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
    case MsgType.Location: {
      const uri = typeof content['geo_uri'] === 'string' ? content['geo_uri'] : '';
      const place = parseGeoUri(uri);
      return place ? { type: 'location', body, uri, place } : { type: 'unsupported' };
    }
    default:
      // Неизвестный msgtype с телом — по спецификации показывается как текст.
      return body ? { type: 'text', body: text } : { type: 'unsupported' };
  }
}

function attachmentOf(content: Record<string, unknown>): Attachment {
  const info = (content['info'] ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const body = typeof content['body'] === 'string' ? content['body'] : '';
  const filename = typeof content['filename'] === 'string' && content['filename'] ? content['filename'] : undefined;
  const attachment: Attachment = { name: filename ?? body };
  // Подпись — `body`, когда имя файла лежит отдельно и с ним не совпадает (Matrix 1.10).
  if (filename && body && body !== filename) attachment.caption = body;
  if (typeof info['mimetype'] === 'string') attachment.mimetype = info['mimetype'];
  const size = num(info['size']);
  if (size !== undefined) attachment.size = size;
  const w = num(info['w']);
  const h = num(info['h']);
  if (w && h) {
    attachment.width = w;
    attachment.height = h;
  }
  const duration = num(info['duration']);
  if (duration !== undefined) attachment.duration = duration;
  const source = sourceOf(content['url'], content['file']);
  if (source) attachment.source = source;
  const thumbnail = sourceOf(info['thumbnail_url'], info['thumbnail_file']);
  if (thumbnail) {
    const thumbInfo = (info['thumbnail_info'] ?? {}) as Record<string, unknown>;
    const tw = num(thumbInfo['w']);
    const th = num(thumbInfo['h']);
    attachment.thumbnail = {
      source: thumbnail,
      ...(tw && th ? { width: tw, height: th } : {}),
      ...(typeof thumbInfo['mimetype'] === 'string' ? { mimetype: thumbInfo['mimetype'] } : {}),
    };
  }
  return attachment;
}

/**
 * `url` — открытое вложение; `file` — зашифрованное, с ключом. Если есть `file`, `url`
 * рядом не смотрим: байты по нему — шифротекст, а открытого адреса у такого вложения не
 * бывает. Ключ без SHA-256 — не ключ: расшифровать, не проверив хэш, нельзя.
 */
function sourceOf(url: unknown, file: unknown): MediaSource | undefined {
  if (file && typeof file === 'object') {
    const f = file as Record<string, unknown>;
    const key = f['key'] as EncryptedFileKey['key'] | undefined;
    const hashes = f['hashes'] as Record<string, string> | undefined;
    if (typeof f['url'] !== 'string' || !isMxc(f['url']) || !key?.k || typeof f['iv'] !== 'string' || !hashes?.['sha256']) return undefined;
    return { mxc: f['url'], encryption: { key, iv: f['iv'], hashes, v: typeof f['v'] === 'string' ? f['v'] : 'v2' } };
  }
  return typeof url === 'string' && isMxc(url) ? { mxc: url } : undefined;
}

const isMxc = (value: string) => /^mxc:\/\/[^/]+\/[^/]+$/.test(value);

/**
 * Опрос — вопрос, ответы и итог. Голос каждого — его *последний* ответ до конца опроса;
 * пустой выбор — голос отозван. Конец опроса признаётся только от его автора.
 */
function pollOf(event: MatrixEvent, context: MapperContext): Poll {
  const content = event.getContent();
  const stable = event.getType() === 'm.poll.start';
  const poll = (content['m.poll'] ?? content['org.matrix.msc3381.poll.start']) as Record<string, unknown> | undefined;
  const textOf = (value: unknown): string => {
    if (typeof value === 'string') return value;
    const record = value as Record<string, unknown> | undefined;
    const list = (record?.['m.text'] ?? record?.['org.matrix.msc1767.text']) as unknown;
    if (typeof list === 'string') return list;
    if (Array.isArray(list)) return String((list[0] as { body?: unknown })?.body ?? '');
    return '';
  };
  const answers = (Array.isArray(poll?.['answers']) ? (poll['answers'] as Array<Record<string, unknown>>) : []).map((answer, index) => ({
    id: String(answer['m.id'] ?? answer['id'] ?? index),
    text: textOf(answer),
    votes: 0,
  }));
  const max = poll?.['max_selections'];
  const maxSelections = typeof max === 'number' && max >= 1 ? Math.floor(max) : 1;
  const undisclosed = String(poll?.['kind'] ?? '').endsWith('undisclosed');

  const id = event.getId();
  const author = event.getSender();
  const ends = id ? context.relationsOf(id, 'm.reference', POLL_END).filter((e) => !e.isRedacted() && e.getSender() === author) : [];
  const endedAt = ends.length ? Math.min(...ends.map((e) => e.getTs())) : Infinity;

  const latest = new Map<string, MatrixEvent>();
  for (const response of id ? context.relationsOf(id, 'm.reference', POLL_RESPONSE) : []) {
    const sender = response.getSender();
    if (!sender || response.isRedacted() || response.getTs() > endedAt) continue;
    const previous = latest.get(sender);
    if (!previous || previous.getTs() <= response.getTs()) latest.set(sender, response);
  }
  const known = new Set(answers.map((a) => a.id));
  let voters = 0;
  let mine: string[] = [];
  for (const [sender, response] of latest) {
    const c = response.getContent();
    const raw = (c['m.selections'] ?? (c['org.matrix.msc3381.poll.response'] as { answers?: unknown } | undefined)?.answers) as unknown;
    const chosen = (Array.isArray(raw) ? raw.map(String) : []).filter((a) => known.has(a)).slice(0, maxSelections);
    if (sender === context.ownUserId) mine = chosen;
    if (chosen.length === 0) continue;
    voters++;
    for (const answer of answers) if (chosen.includes(answer.id)) answer.votes++;
  }
  return { question: textOf(poll?.['question']), answers, voters, mine, maxSelections, undisclosed, ended: ends.length > 0, stable };
}

function serviceEvent(event: MatrixEvent, context: MapperContext): ServiceEvent | undefined {
  const content = event.getContent();
  const prev = event.getPrevContent();
  switch (event.getType()) {
    case EventType.RoomMember: {
      const target = event.getStateKey() ?? '';
      const name = (typeof content['displayname'] === 'string' && content['displayname']) || context.nameOf(target);
      const people = [name];
      const was = prev['membership'];
      switch (content['membership']) {
        case 'join':
          if (was === 'join') {
            const from = typeof prev['displayname'] === 'string' ? prev['displayname'] : '';
            // Сменили аватар, а не имя, — не повод для строки в ленте.
            return from && from !== name ? { type: 'renamedThemselves', from, to: name } : undefined;
          }
          return { type: 'joined', people };
        case 'invite':
          return { type: 'invited', people };
        case 'leave':
          if (was === 'invite' && event.getSender() === target) return undefined; // отказался от приглашения
          return event.getSender() === target ? { type: 'left', people } : { type: 'removed', people };
        case 'ban':
          return { type: 'banned', people };
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
