/**
 * Комната — так, как её видит список чатов. Свои типы, а не `Room` из SDK: выше `core/`
 * SDK не виден никому (см. план, «Архитектура»).
 */

/** Один человек — столько, сколько нужно строке списка. */
export interface RoomFace {
  /** Matrix ID. Из него выращивается существо-лицо — идентификатор, а не имя: имя меняют. */
  id: string;
  name: string;
  /** `mxc://`, если человек поставил фото. */
  avatarUrl?: string;
}

export type RoomKind = 'direct' | 'group' | 'space';

/**
 * Насколько громко значок говорит о непрочитанном — как `UnreadEmphasis` нативной Искры
 * (ветка dev). Два ответа: акцентный и серый. Упоминание — не третий цвет, а отдельная
 * метка «@» рядом: красный в списке чатов читается как ошибка.
 */
export type UnreadEmphasis = 'ordinary' | 'muted';

/** Что показать вместо последнего сообщения. Текст — как есть; остальное переводит экран. */
export type Preview =
  | { kind: 'text'; text: string }
  | {
      kind: 'photo' | 'video' | 'videoNote' | 'voice' | 'audio' | 'file' | 'location' | 'sticker' | 'poll' | 'deleted' | 'unreadable';
      /** Подпись под фото, если она есть, — её и показываем. */
      text?: string;
    };

export interface RoomSummary {
  id: string;
  /** Имя, как его вывело ядро. `undefined` — называть нечем, экран скажет «Чат». */
  name?: string;
  avatarUrl?: string;
  /** Из чего растить лицо: другой человек в личном чате, иначе — сама комната. */
  avatarSeed: string;
  /** Для группы без фото — до двух собеседников (себя экран добавит сам). */
  faces: RoomFace[];
  kind: RoomKind;
  encrypted: boolean;
  membership: 'join' | 'invite';
  /** Кто пригласил — имя, если известно, иначе Matrix ID. */
  invitedBy?: string;

  /** Сколько уведомлений насчитал сервер. У беззвучного чата — ноль, даже если есть новое. */
  unreadCount: number;
  mentionCount: number;
  /** Есть новое после отметки о прочтении — хоть бы и без уведомлений. */
  hasUnreadMessages: boolean;
  isMarkedUnread: boolean;
  isMuted: boolean;
  isFavourite: boolean;
  isLowPriority: boolean;

  preview?: Preview;
  /** Мс с эпохи — по нему сортировка. */
  lastActivity: number;
}

export const hasUnread = (room: RoomSummary): boolean =>
  room.unreadCount > 0 || room.hasUnreadMessages || room.isMarkedUnread;

export const emphasisOf = (room: RoomSummary): UnreadEmphasis => (room.isMuted ? 'muted' : 'ordinary');

/**
 * Считается ли чат «непрочитанным» для заголовка вкладки и значка на иконке: беззвучный —
 * нет (его и просили не беспокоить), но упоминание пробивается и сквозь беззвучие.
 */
export const countsTowardsBadge = (room: RoomSummary): boolean =>
  room.membership === 'invite' || room.mentionCount > 0 || (!room.isMuted && hasUnread(room));
