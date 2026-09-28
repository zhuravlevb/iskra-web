/**
 * Сообщение — так, как его видит лента. Свой тип, а не `MatrixEvent` (см. план,
 * «Архитектура»); строится `TimelineMapper` и только им.
 */

export interface Attachment {
  body: string;
  mimetype?: string;
  size?: number;
  width?: number;
  height?: number;
  /** мс */
  duration?: number;
  /** Незашифрованное вложение — `mxc://` прямо тут. */
  url?: string;
  /** Зашифрованное — `file` с ключом (этап 7). */
  encrypted?: boolean;
}

export type ServiceEvent =
  | { type: 'joined'; who: string }
  | { type: 'left'; who: string }
  | { type: 'invited'; who: string }
  | { type: 'removed'; who: string }
  | { type: 'banned'; who: string }
  | { type: 'renamedThemselves'; from: string; to: string }
  | { type: 'roomRenamed'; name: string }
  | { type: 'roomTopicChanged' }
  | { type: 'roomPictureChanged' }
  | { type: 'roomCreated' }
  | { type: 'encryptionEnabled' };

export type MessageKind =
  | { type: 'text'; body: string }
  | { type: 'emote'; body: string }
  | { type: 'notice'; body: string }
  | { type: 'image' | 'sticker' | 'video' | 'videoNote' | 'voice' | 'audio' | 'file'; attachment: Attachment }
  | { type: 'location'; body: string; uri: string }
  | { type: 'poll'; question: string; answers: string[] }
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
}

export const isService = (m: Message): boolean => m.kind.type === 'service';
