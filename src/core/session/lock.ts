/**
 * Одна вкладка на аккаунт.
 *
 * Две вкладки с одним криптохранилищем — это две копии Olm-сессий, которые пишут поверх
 * друг друга и ломают расшифровку так, что починить уже нельзя. На десктопе вторая
 * вкладка — норма: человек открыл ссылку на Искру из письма.
 *
 * Web Locks: лок `iskra-session-<userId>` держит та вкладка, у которой поднят клиент.
 * Не получили — клиент не поднимаем. Разговор между вкладками — `BroadcastChannel`:
 * «перейди туда» (та вкладка просит фокус) и «открой здесь» (та отпускает лок).
 */

type Message = { type: 'focus' } | { type: 'release' };

export interface LockCallbacks {
  /** Другая вкладка попросила её показать. Окно может и не дать себя сфокусировать. */
  onFocusRequested?: () => void;
  /**
   * Другая вкладка забрала сессию себе. Лок отпускается, **когда это закончится**:
   * сначала клиент останавливается и дописывает базы, потом их открывает другая вкладка.
   */
  onTakenOver?: () => Promise<void> | void;
}

export class SessionLock {
  private released = false;

  private constructor(
    private readonly channel: BroadcastChannel | undefined,
    private readonly free: () => void,
  ) {}

  static lockName(userId: string): string {
    return `iskra-session-${userId}`;
  }

  private static channelName(userId: string): string {
    return `iskra-session-${userId}`;
  }

  /** Пробует взять лок сразу. Занят — `null`. */
  static acquire(userId: string, callbacks: LockCallbacks = {}): Promise<SessionLock | null> {
    return SessionLock.request(userId, callbacks, true);
  }

  /** «Открыть здесь»: просит держателя отпустить лок и ждёт его. */
  static async takeOver(userId: string, callbacks: LockCallbacks = {}): Promise<SessionLock> {
    SessionLock.post(userId, { type: 'release' });
    const lock = await SessionLock.request(userId, callbacks, false);
    // Без ifAvailable запрос ждёт, пока лок не освободится, и `null` не вернёт.
    return lock!;
  }

  /** «Перейти туда»: просит держателя показаться. */
  static requestFocus(userId: string): void {
    SessionLock.post(userId, { type: 'focus' });
  }

  private static post(userId: string, message: Message): void {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(SessionLock.channelName(userId));
    channel.postMessage(message);
    channel.close();
  }

  private static request(userId: string, callbacks: LockCallbacks, ifAvailable: boolean): Promise<SessionLock | null> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    if (!locks) {
      // Браузер без Web Locks — защиты нет, и притворяться, что она есть, незачем.
      return Promise.resolve(new SessionLock(undefined, () => {}));
    }

    return new Promise((resolve, reject) => {
      locks
        .request(SessionLock.lockName(userId), { ifAvailable }, (granted) => {
          if (!granted) {
            resolve(null);
            return undefined;
          }
          // Лок держится, пока не разрешится этот промис.
          return new Promise<void>((free) => {
            const channel =
              typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(SessionLock.channelName(userId));
            const lock = new SessionLock(channel, free);
            if (channel) {
              channel.onmessage = (event: MessageEvent<Message>) => {
                if (event.data?.type === 'focus') callbacks.onFocusRequested?.();
                if (event.data?.type === 'release') {
                  void Promise.resolve(callbacks.onTakenOver?.())
                    .catch(() => {})
                    .finally(() => lock.release());
                }
              };
            }
            resolve(lock);
          });
        })
        .catch(reject);
    });
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.channel?.close();
    this.free();
  }
}
