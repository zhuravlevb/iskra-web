/**
 * `UserSession` владеет `MatrixClient`, как и в Искре; ничто выше его SDK не трогает.
 * Сторы создаются от сессии и умирают вместе с ней.
 *
 * Вкладка на десктопе живёт днями, и сессия должна переживать то, чего на телефоне почти
 * не бывает: сон ноутбука, смену сети, обновление access token посреди ночи. После
 * пробуждения (`visibilitychange` + `online`) синхронизация перезапускается сразу, а не
 * ждёт таймаута длинного опроса.
 */
import {
  ClientEvent,
  createClient,
  HttpApiEvent,
  IndexedDBStore,
  MemoryStore,
  OAuth2,
  SyncState,
  TokenRefresher,
  type MatrixClient,
  type ValidatedAuthMetadata,
} from 'matrix-js-sdk';
import { fetchFor } from '../auth/server';
import { deleteDatabase } from '../storage/idb';
import { fromBase64 } from '../storage/secretBox';
import type { Account, AccountSecrets } from '../storage/vault';
import { quietLogger } from '../support/logger';

export type Connection = 'connecting' | 'online' | 'offline';

export interface SessionEvents {
  /** Токены обновились — их надо сохранить, иначе после перезагрузки вход пропадёт. */
  onTokensRefreshed: (tokens: { accessToken: string; refreshToken?: string }) => Promise<void>;
  /** Сервер перестал принимать сеанс: его завершили с другого устройства. */
  onLoggedOut: () => void;
}

export interface SessionOptions {
  /**
   * Поднимать ли Rust-крипто. Выключают только тесты и демо, где сервер не умеет ключей.
   * Настоящий аккаунт без крипто не поднимается никогда.
   */
  crypto?: boolean;
  /** Хранить ли синхронизацию в IndexedDB. Без неё — в памяти. */
  persistent?: boolean;
}

/** Имена баз этого пользователя — чтобы при выходе удалить все. */
export function databaseNames(userId: string) {
  return {
    sync: `iskra-sync-${userId}`,
    cryptoPrefix: `iskra-crypto-${userId}`,
  };
}

export class UserSession {
  connection = $state<Connection>('connecting');
  /** Первая синхронизация прошла — список комнат уже есть, хотя бы из кэша. */
  ready = $state(false);

  readonly userId: string;
  private readonly client: MatrixClient;
  private readonly account: Account;
  private readonly detach: Array<() => void> = [];
  private stopped = false;

  private constructor(client: MatrixClient, account: Account) {
    this.client = client;
    this.account = account;
    this.userId = account.userId;
  }

  static async start(
    account: Account,
    secrets: AccountSecrets,
    events: SessionEvents,
    options: SessionOptions = {},
  ): Promise<UserSession> {
    const { crypto = true, persistent = true } = options;
    const names = databaseNames(account.userId);
    const logger = quietLogger();
    const demo = account.method === 'demo';

    const store =
      persistent && typeof indexedDB !== 'undefined'
        ? new IndexedDBStore({ indexedDB, dbName: names.sync })
        : new MemoryStore();

    let tokenRefreshFunction;
    if (account.oauth && secrets.refreshToken) {
      const oauth = new OAuth2(
        account.oauth.metadata as unknown as ValidatedAuthMetadata,
        { clientId: account.oauth.clientId, redirectUri: account.oauth.redirectUri, deviceId: account.deviceId },
        logger,
      );
      const refresher = new TokenRefresher(oauth, (tokens) =>
        events.onTokensRefreshed({
          accessToken: tokens.accessToken,
          ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
        }),
      );
      tokenRefreshFunction = refresher.tokenRefreshFunction;
    }

    const client = createClient({
      baseUrl: account.homeserverUrl,
      userId: account.userId,
      deviceId: account.deviceId,
      accessToken: secrets.accessToken,
      ...(secrets.refreshToken ? { refreshToken: secrets.refreshToken } : {}),
      ...(tokenRefreshFunction ? { tokenRefreshFunction } : {}),
      fetchFn: fetchFor(demo),
      store,
      logger,
      timelineSupport: true,
    });

    await store.startup();
    if (crypto) {
      await client.initRustCrypto({
        storageKey: fromBase64(secrets.cryptoStorageKey),
        cryptoDatabasePrefix: names.cryptoPrefix,
        useIndexedDB: persistent,
      });
    }

    const session = new UserSession(client, account);
    session.listen(events);
    await client.startClient({ initialSyncLimit: 20, lazyLoadMembers: true });
    return session;
  }

  private listen(events: SessionEvents): void {
    const onSync = (state: SyncState) => {
      if (state === SyncState.Prepared || state === SyncState.Syncing || state === SyncState.Catchup) {
        this.connection = 'online';
        this.ready = true;
      } else if (state === SyncState.Error || state === SyncState.Reconnecting) {
        this.connection = 'offline';
      }
    };
    this.client.on(ClientEvent.Sync, onSync);
    this.detach.push(() => this.client.off(ClientEvent.Sync, onSync));

    const onLoggedOut = () => {
      if (this.stopped) return;
      events.onLoggedOut();
    };
    this.client.on(HttpApiEvent.SessionLoggedOut, onLoggedOut);
    this.detach.push(() => this.client.off(HttpApiEvent.SessionLoggedOut, onLoggedOut));

    if (typeof window === 'undefined') return;
    // Проснулись или вернулась сеть — не ждём таймаута длинного опроса.
    const wake = () => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) this.client.retryImmediately();
    };
    const offline = () => (this.connection = 'offline');
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('offline', offline);
    this.detach.push(() => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', offline);
    });
  }

  /** Повторить сейчас — кнопка «Повторить» на полосе «Нет соединения». */
  retry(): void {
    this.client.retryImmediately();
  }

  /** Остановить, ничего не удаляя: другая вкладка забрала сессию, или страница уходит. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const off of this.detach.splice(0)) off();
    this.client.stopClient();
  }

  /**
   * Выход: сеанс на сервере завершается, и на устройстве не остаётся ничего — ни баз,
   * ни ключей. Без сети сервер не узнает, но локально всё равно всё удаляется: человек
   * просил выйти, а не «выйти, когда получится».
   */
  async signOut(): Promise<void> {
    const oauth = this.account.oauth;
    try {
      if (oauth) {
        const auth = new OAuth2(oauth.metadata as unknown as ValidatedAuthMetadata, {
          clientId: oauth.clientId,
          redirectUri: oauth.redirectUri,
          deviceId: this.account.deviceId,
        });
        const token = this.client.getAccessToken();
        const refresh = this.client.getRefreshToken();
        if (refresh) await auth.revokeToken(refresh, 'refresh_token');
        if (token) await auth.revokeToken(token, 'access_token');
      } else {
        await this.client.logout(false);
      }
    } catch {
      // Сервер не ответил — сеанс там останется, пока его не завершат с другого устройства.
    }
    await this.wipe();
  }

  /** Удаляет всё локальное: кэш синхронизации и криптохранилище. */
  async wipe(): Promise<void> {
    this.stop();
    await wipeUserData(this.account.userId, this.client);
  }
}

/** Удаляет базы пользователя; с клиентом — его руками, без — по именам. */
export async function wipeUserData(userId: string, client?: MatrixClient): Promise<void> {
  const names = databaseNames(userId);
  if (client) {
    try {
      await client.clearStores({ cryptoDatabasePrefix: names.cryptoPrefix });
    } catch {
      // Падаем ниже на удаление по именам.
    }
  }
  if (typeof indexedDB === 'undefined') return;
  await Promise.all([
    deleteDatabase(`matrix-js-sdk:${names.sync}`),
    deleteDatabase(`${names.cryptoPrefix}::matrix-sdk-crypto`),
    deleteDatabase(`${names.cryptoPrefix}::matrix-sdk-crypto-meta`),
  ]);
}
