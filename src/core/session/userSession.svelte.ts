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
  PendingEventOrdering,
  SyncState,
  TokenRefresher,
  type MatrixClient,
  type ValidatedAuthMetadata,
} from 'matrix-js-sdk';
import { fetchFor } from '../auth/server';
import { MediaLoader } from '../media/media';
import { uploadClientFor } from '../media/upload';
import { ThumbnailCache } from '../media/thumbnails';
import { RoomListStore } from '../rooms/roomListStore.svelte.ts';
import { RoomDetailsStore } from '../rooms/roomDetails.svelte.ts';
import { createDirect, createGroup } from '../rooms/create';
import { TimelineStore } from '../timeline/timelineStore.svelte.ts';
import { RecoveryStore } from '../encryption/recovery.svelte.ts';
import { SecretStorageKeyHolder } from '../encryption/secretStorageKey';
import { VerificationStore } from '../encryption/verification.svelte.ts';
import { deleteDatabase } from '../storage/idb';
import { fromBase64 } from '../storage/secretBox';
import { vault, type Account, type AccountSecrets } from '../storage/vault';
import { quietLogger } from '../support/logger';
import { BlockList } from './blockList.svelte.ts';

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
  /** Как меня зовут и как я выгляжу — живое: меняется, когда поменяли в настройках или где-то ещё. */
  profile = $state<{ id: string; name: string; avatarUrl?: string }>({ id: '', name: '' });
  /** Первая синхронизация прошла — список комнат уже есть, хотя бы из кэша. */
  ready = $state(false);

  readonly userId: string;
  /** Список чатов — живёт, пока жива сессия. */
  readonly rooms: RoomListStore;
  /** Аватарки и миниатюры: с токеном, в памяти, с потолком. */
  readonly thumbnails: ThumbnailCache;
  /** Вложения: превью в кэше, оригиналы — тому, кто показывает. */
  readonly media: MediaLoader;
  /** Код восстановления и доступ к старой переписке. `null` — сессия без крипто (тесты). */
  readonly recovery: RecoveryStore | null;
  /** Сверка эмодзи с другим устройством. */
  readonly verification: VerificationStore | null;
  /** Заблокированные — игнор-список аккаунта. */
  readonly blocked: BlockList;
  private readonly client: MatrixClient;
  private readonly account: Account;
  private readonly detach: Array<() => void> = [];
  private stopped = false;

  private constructor(client: MatrixClient, account: Account, keys: SecretStorageKeyHolder | null) {
    this.client = client;
    this.account = account;
    this.userId = account.userId;
    this.rooms = new RoomListStore(client);
    this.thumbnails = new ThumbnailCache({
      httpUrl: (mxc, size) => client.mxcUrlToHttp(mxc, size, size, 'crop', false, true, true),
      accessToken: () => client.getAccessToken(),
      fetch: fetchFor(account.method === 'demo'),
    });
    this.media = new MediaLoader({
      downloadUrl: (mxc) => client.mxcUrlToHttp(mxc, undefined, undefined, undefined, false, true, true),
      thumbnailUrl: (mxc, size) => client.mxcUrlToHttp(mxc, size, size, 'scale', false, true, true),
      accessToken: () => client.getAccessToken(),
      fetch: fetchFor(account.method === 'demo'),
    });
    this.recovery = keys ? new RecoveryStore(client, keys) : null;
    this.verification = keys ? new VerificationStore(client) : null;
    this.blocked = new BlockList(client);
  }

  /** Лента комнаты. Живёт, пока открыт чат: тот, кто открыл, её и `destroy()`. */
  timeline(roomId: string): TimelineStore {
    return new TimelineStore(this.client, roomId, uploadClientFor(this.client, this.account.method === 'demo' ? fetchFor(true) : undefined));
  }

  private uploadLimitValue: Promise<number | undefined> | undefined;

  /** Сколько сервер примет одним файлом (`m.upload.size`) — или «не сказал». */
  uploadLimit(): Promise<number | undefined> {
    this.uploadLimitValue ??= this.client
      .getMediaConfig()
      .then((config) => (typeof config['m.upload.size'] === 'number' ? config['m.upload.size'] : undefined))
      .catch(() => undefined);
    return this.uploadLimitValue;
  }

  /** Черновик чата — под ключом аккаунта (`vault`). Не прочитался — пусто, а не ошибка. */
  async draft(roomId: string): Promise<string> {
    return vault.draft(this.userId, roomId).catch(() => '');
  }

  /** Пустой — стереть. Не записался — не повод мешать человеку печатать. */
  async saveDraft(roomId: string, text: string): Promise<void> {
    await vault.saveDraft(this.userId, roomId, text).catch(() => {});
  }

  /** Можно ли писать в комнату: вошли, а не только приглашены. */
  canSend(roomId: string): boolean {
    return this.client.getRoom(roomId)?.getMyMembership() === 'join';
  }

  /** Профиль — с сервера: он источник, а не то, что SDK собрал из событий комнат. */
  async readProfile(): Promise<void> {
    this.profile = this.me();
    try {
      const info = await this.client.getProfileInfo(this.userId);
      this.profile = {
        id: this.userId,
        name: info.displayname || this.userId,
        ...(info.avatar_url ? { avatarUrl: info.avatar_url } : {}),
      };
    } catch {
      // Нет сети — останется то, что знает SDK.
    }
  }

  /** Как меня зовут и как я выгляжу — для своего лица в группе лиц. */
  me(): { id: string; name: string; avatarUrl?: string } {
    const user = this.client.getUser(this.userId);
    return {
      id: this.userId,
      name: user?.displayName || this.userId,
      ...(user?.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    };
  }

  // ————— Комнаты: «О чате» и новые —————

  /** «О чате» комнаты. Живёт, пока открыта панель: тот, кто открыл, и `destroy()`. */
  roomDetails(roomId: string): RoomDetailsStore {
    return new RoomDetailsStore(this.client, roomId, (id) => this.rooms.get(id)?.kind === 'direct');
  }

  createDirect(userId: string): Promise<string> {
    return createDirect(this.client, userId);
  }

  createGroup(name: string, open: boolean): Promise<string> {
    return createGroup(this.client, name, open);
  }

  // ————— Профиль, устройства, аккаунт —————

  /**
   * Загрузить картинку открыто — для фото профиля и комнаты. Они публичны по устройству
   * Matrix (лежат в состоянии, которое не шифруется), поэтому и шифровать их незачем.
   */
  async uploadPublic(blob: Blob, name: string, type: string): Promise<string> {
    const uploader = uploadClientFor(this.client, this.account.method === 'demo' ? fetchFor(true) : undefined);
    return uploader.upload(blob, { name, type });
  }

  async setName(name: string): Promise<void> {
    await this.client.setDisplayName(name.trim());
    await this.readProfile();
  }

  /** Фото профиля; `null` — убрать. */
  async setPhoto(photo: { blob: Blob; name: string; type: string } | null): Promise<void> {
    const mxc = photo ? await this.uploadPublic(photo.blob, photo.name, photo.type) : '';
    await this.client.setAvatarUrl(mxc);
    await this.readProfile();
  }

  /** Мои устройства — список с сервера; это отмечено. */
  async devices(): Promise<Array<{ id: string; name: string; lastSeen?: number; current: boolean }>> {
    const { devices } = await this.client.getDevices();
    const mine = this.client.getDeviceId();
    return devices
      .map((d) => ({
        id: d.device_id,
        name: d.display_name || d.device_id,
        ...(d.last_seen_ts ? { lastSeen: d.last_seen_ts } : {}),
        current: d.device_id === mine,
      }))
      .sort((a, b) => +b.current - +a.current || (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
  }

  /**
   * Страница аккаунта у сервера (`account_management_uri` MAS) — там живут устройства и
   * выход из них: на серверах с MAS удалить устройство через клиентский API нельзя.
   */
  accountPage(): string | undefined {
    const uri = this.account.oauth?.metadata['account_management_uri'];
    return typeof uri === 'string' && /^https:\/\//.test(uri) ? uri : undefined;
  }

  /**
   * «Очистить кэш»: кэш синхронизации — вон, ключи шифрования и вход — остаются. После
   * этого страницу перезагружают: клиент начнёт с первой синхронизации.
   */
  async clearCache(): Promise<void> {
    this.stop();
    try {
      await this.client.store.deleteAllData();
    } catch {
      await deleteDatabase(`matrix-js-sdk:${databaseNames(this.userId).sync}`).catch(() => {});
    }
  }

  /** Способ входа — для экрана «О приложении» и «Хранилища»: демо не хранится между входами. */
  get method(): Account['method'] {
    return this.account.method;
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

    // Ключ секретного хранилища — только на время операции, см. `SecretStorageKeyHolder`.
    const keys = crypto ? new SecretStorageKeyHolder() : null;
    const client = createClient({
      baseUrl: account.homeserverUrl,
      ...(keys ? { cryptoCallbacks: keys.callbacks } : {}),
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

    const session = new UserSession(client, account, keys);
    session.listen(events);
    await client.startClient({
      initialSyncLimit: 20,
      lazyLoadMembers: true,
      // Не ушедшие — отдельно от ленты и в её конце, пока не уйдут: «Не отправлено» не
      // должно тонуть в истории, если сервер тем временем прислал новое.
      pendingEventOrdering: PendingEventOrdering.Detached,
    });
    return session;
  }

  private listen(events: SessionEvents): void {
    const onSync = (state: SyncState) => {
      if (state === SyncState.Prepared || state === SyncState.Syncing || state === SyncState.Catchup) {
        this.connection = 'online';
        if (!this.ready) void this.readProfile();
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
    this.rooms.destroy();
    this.blocked.destroy();
    this.verification?.destroy();
    this.thumbnails.clear();
    this.media.clear();
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
