/**
 * Что можно сделать с сообщением — один объект на ленту, а не десяток колбэков в каждой
 * строке. Собирает его `RoomView`: ответ и правка идут в композер, остальное — в ленту.
 */
import type { Message } from '../../core/timeline/message';

export interface MessageActions {
  canReply: boolean;
  canPin: boolean;
  reply(message: Message): void;
  edit(message: Message): void;
  react(message: Message, key: string): void;
  vote(message: Message, answerIds: string[]): void;
  pin(message: Message): void;
  unpin(message: Message): void;
  /** Спросить «удалить у всех?» — и удалить. */
  remove(message: Message): void;
  retry(key: string): void;
  discard(key: string): void;
  /** Меню: у точки — для мыши, листом — для пальца. */
  openMenu(message: Message, at: { x: number; y: number }, sheet: boolean): void;
}

/** Полоса над полем композера: на что отвечаем или что правим. */
export type ComposerContext = { kind: 'reply' | 'edit'; message: Message } | null;
