/**
 * Сообщение — так, как его видит лента. Свой тип, а не `MatrixEvent` (см. план,
 * «Архитектура»); строится `TimelineMapper` и только им.
 */

/**
 * Ключ зашифрованного вложения — `EncryptedFile` из спецификации без `url`: JWK, IV и хэш
 * шифротекста. Живёт в памяти ровно столько, сколько событие; на диск его пишет SDK, не мы.
 */
export interface EncryptedFileKey {
  key: { kty: string; key_ops: string[]; alg: string; k: string; ext: boolean };
  iv: string;
  hashes: Record<string, string>;
  v: string;
}

/** Где лежат байты: `mxc://`, и если вложение зашифровано — ключ к нему. */
export interface MediaSource {
  mxc: string;
  encryption?: EncryptedFileKey;
}

export interface Attachment {
  /** Имя файла: `filename`, а если его нет — `body`. */
  name: string;
  /** Подпись (Matrix 1.10): `body`, когда рядом есть отдельное `filename`. */
  caption?: string;
  mimetype?: string;
  size?: number;
  width?: number;
  height?: number;
  /** мс */
  duration?: number;
  /** Нет — вложение без байтов (битое событие): показать можно только подпись. */
  source?: MediaSource;
  thumbnail?: { source: MediaSource; width?: number; height?: number; mimetype?: string };
}

/**
 * Служебная строка. Про людей — список, а не одно имя: подряд идущие «вошла Аня», «вошёл
 * Борис» склеиваются в одну строку (`layout.ts`), как в нативной Искре.
 */
export type ServiceEvent =
  | { type: 'joined' | 'left' | 'invited' | 'removed' | 'banned'; people: string[] }
  | { type: 'renamedThemselves'; from: string; to: string }
  | { type: 'roomRenamed'; name: string }
  | { type: 'roomTopicChanged' }
  | { type: 'roomPictureChanged' }
  | { type: 'roomCreated' }
  | { type: 'encryptionEnabled' };

export interface PollAnswer {
  id: string;
  text: string;
  votes: number;
}

export interface Poll {
  question: string;
  answers: PollAnswer[];
  /** Сколько человек проголосовало (не голосов: при нескольких ответах их больше). */
  voters: number;
  /** Мой выбор — ID ответов; пусто — не голосовал. */
  mine: string[];
  maxSelections: number;
  /** Итоги скрыты до конца опроса (`undisclosed`). */
  undisclosed: boolean;
  ended: boolean;
  /** Пространство имён опроса — ответ уходит в том же, в каком опрос пришёл. */
  stable: boolean;
}

export type MessageKind =
  /** `html` — `formatted_body`, как пришёл: чистит его экран (DOMPurify), не ядро. */
  | { type: 'text'; body: string; html?: string }
  | { type: 'emote'; body: string; html?: string }
  | { type: 'notice'; body: string; html?: string }
  | { type: 'image' | 'sticker' | 'video' | 'videoNote' | 'voice' | 'audio' | 'file'; attachment: Attachment }
  | { type: 'location'; body: string; uri: string }
  | { type: 'poll'; poll: Poll }
  | { type: 'service'; event: ServiceEvent }
  | { type: 'deleted' }
  | { type: 'unreadable' }
  | { type: 'unsupported' };

/** Почему не ушло — как `SendFailure` нативной Искры. */
export type SendFailure = 'insecureDevices' | 'identityChanged' | 'verificationRequired' | 'server';

export type Delivery = { state: 'sending' } | { state: 'sent' } | { state: 'failed'; reason: SendFailure };

export interface Reaction {
  key: string;
  count: number;
  mine: boolean;
}

export interface ReplyPreview {
  eventId: string;
  senderName?: string;
  /** Текст оригинала одной строкой — или пусто, если его не видно. */
  text?: string;
}

export interface Message {
  /** Стабильный ключ строки: не меняется, когда local echo получает настоящий ID. */
  key: string;
  eventId?: string;
  kind: MessageKind;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  own: boolean;
  ts: number;
  delivery: Delivery;
  edited: boolean;
  replyTo?: ReplyPreview;
  reactions: Reaction[];
  pinned: boolean;
  /** Своё текстовое, ушедшее, не удалённое. */
  canEdit: boolean;
  /** Своё — или право модератора удалять чужое. */
  canDelete: boolean;
}

export const isService = (m: Message): boolean => m.kind.type === 'service';
