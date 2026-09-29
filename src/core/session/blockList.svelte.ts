/**
 * Кого я заблокировал — и два действия, которые это меняют.
 *
 * «Заблокировать» здесь — это Matrix *ignore*, как в нативной Искре: список в данных аккаунта
 * (`m.ignored_user_list`), поэтому он едет за аккаунтом на все устройства, а сервер сам
 * перестаёт присылать сообщения заблокированного. То, что уже загружено, SDK не прячет —
 * прячут лента и список чатов, по этому же списку.
 *
 * Это в одну сторону, и честно: блокировка скрывает человека *от меня*. Запретить ему писать
 * клиент в Matrix не может. Слово — «заблокировать», потому что так говорят люди, но
 * обещаем мы не больше, чем делает протокол.
 */
import { ClientEvent, EventType, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk';

/** Ключи текстов нативной Искры (`account.*Failed`). */
export type BlockFailure = 'blockFailed' | 'unblockFailed';

export class BlockList {
  /** Matrix ID по алфавиту. Живой: блокировка с другого устройства видна и здесь. */
  ids = $state.raw<string[]>([]);
  /** Блокировка или разблокировка не удалась. */
  failure = $state<BlockFailure | null>(null);

  private readonly client: MatrixClient;
  private readonly off: () => void;

  constructor(client: MatrixClient) {
    this.client = client;
    const onAccountData = (event: MatrixEvent) => {
      if (event.getType() === EventType.IgnoredUserList) this.read();
    };
    client.on(ClientEvent.AccountData, onAccountData);
    this.off = () => client.off(ClientEvent.AccountData, onAccountData);
    this.read();
  }

  has(userId: string): boolean {
    return this.ids.includes(userId);
  }

  /** Заблокировать. Ответ приходит, когда сервер вернул новый список синхронизацией. */
  async block(userId: string): Promise<void> {
    await this.change(userId, true);
  }

  async unblock(userId: string): Promise<void> {
    await this.change(userId, false);
  }

  dismissFailure(): void {
    this.failure = null;
  }

  destroy(): void {
    this.off();
  }

  private async change(userId: string, blocked: boolean): Promise<void> {
    this.failure = null;
    // Список — из SDK, а не из `ids`: между чтением и записью мог прийти чужой.
    const current = this.client.getIgnoredUsers();
    const next = blocked ? [...current.filter((id) => id !== userId), userId] : current.filter((id) => id !== userId);
    try {
      await this.client.setIgnoredUsers(next);
      this.read();
    } catch {
      this.failure = blocked ? 'blockFailed' : 'unblockFailed';
    }
  }

  private read(): void {
    const ids = [...this.client.getIgnoredUsers()].sort();
    if (ids.join('\n') !== this.ids.join('\n')) this.ids = ids;
  }
}
