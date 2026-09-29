/**
 * Как *вы* зовёте человека — в отличие от того, как он зовёт себя сам. `LocalNames`
 * нативной Искры.
 *
 * Имя в Matrix принадлежит тому, кто его поставил, и у личного чата своего имени нет: он
 * называется собеседником. Друг, записанный в телефоне как «Мама», приходит в список как
 * `anna_1987`. Ответ протокола — переименовать комнату — ровно неправильный: `m.room.name`
 * в личном чате получит и увидит собеседник. Решить про себя, как звать друга, не должно
 * значить объявить это другу.
 *
 * Поэтому имя живёт на этом устройстве, и сервер о нём не знает:
 * - **Не синхронизируется.** На других устройствах аккаунта его нет, и экран, где его
 *   ставят, говорит это прямо. В данные аккаунта его не перенести: они на сервере, а это
 *   единственное, чему там быть нельзя.
 * - **Уходит с аккаунтом** — это личные заметки о людях (`vault`).
 * - **Действует везде**, потому что подставляется там, где имя чата считается: в списке
 *   (`summarize`) и в «О чате» (`RoomDetailsStore`).
 *
 * Только личные чаты: имя группы — общее, и тихо показывать одному человеку другое — способ
 * сделать так, чтобы двое не смогли договориться, о какой комнате речь.
 */
import { vault } from '../storage/vault';

/** Что нужно тем, кто считает имя чата: прочитать и узнать, что поменялось. */
export interface LocalNameSource {
  get(roomId: string): string | undefined;
  /** `roomId` — чье имя поменялось; `null` — все (прочитана таблица). Возвращает отписку. */
  onChange(listener: (roomId: string | null) => void): () => void;
}

export interface LocalNameStorage {
  load(userId: string): Promise<Record<string, string>>;
  save(userId: string, roomId: string, name: string): Promise<void>;
}

const vaultStorage: LocalNameStorage = {
  load: (userId) => vault.localNames(userId),
  save: (userId, roomId, name) => vault.saveLocalName(userId, roomId, name),
};

export class LocalNames implements LocalNameSource {
  private names = $state.raw<Record<string, string>>({});
  // Подписчики, не состояние.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly listeners = new Set<(roomId: string | null) => void>();

  constructor(
    private readonly userId: string,
    private readonly storage: LocalNameStorage = vaultStorage,
  ) {}

  /** Прочитать таблицу. Не прочиталась — имён нет: это не повод не открыть приложение. */
  async load(): Promise<void> {
    this.names = await this.storage.load(this.userId).catch(() => ({}));
    this.emit(null);
  }

  get(roomId: string): string | undefined {
    return this.names[roomId];
  }

  /**
   * Поставить имя, или — пустым — вернуть настоящее. Обрезается на входе: лишний пробел —
   * не переименование; ничего не поменялось — никого не будим. В памяти — сразу, и экраны
   * узнают сразу; промис — это запись на диск. Его стоит дождаться, прежде чем говорить
   * «готово»: вкладка, закрытая сразу после «Сохранить», иначе потеряла бы имя. Не
   * записалось — имя живёт до перезагрузки, и мешать человеку из-за этого нечем.
   */
  set(roomId: string, name: string | null): Promise<void> {
    const trimmed = (name ?? '').trim();
    if ((this.names[roomId] ?? '') === trimmed) return Promise.resolve();
    const next = { ...this.names };
    if (trimmed) next[roomId] = trimmed;
    else delete next[roomId];
    this.names = next;
    this.emit(roomId);
    return this.storage.save(this.userId, roomId, trimmed).catch(() => {});
  }

  onChange(listener: (roomId: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(roomId: string | null): void {
    for (const listener of this.listeners) listener(roomId);
  }
}
