/**
 * Демо-сервер: поддельный homeserver внутри приложения, но настоящий `matrix-js-sdk`
 * поверх него — через подменённый `fetchFn` в `createClient`.
 *
 * Как в нативной Искре, он нужен, чтобы посмотреть любой экран с чем-то на нём, и чтобы
 * разрабатывать вход без matrix.org: `alice` / `password`, варианты «только пароль»,
 * «только legacy SSO», «медленный».
 *
 * Всё, что SDK спросил, а сервер не узнал, собирается в `unknown`, и тест держит этот
 * список пустым: иначе демо тихо расходится с тем, что SDK на самом деле делает.
 *
 * Настоящего аккаунта он не трогает никогда: адрес — в зоне `.invalid`, которая по
 * RFC 2606 не резолвится, и ни один запрос отсюда в сеть не уходит.
 */
import { emptyAccount, mergeSignatures, type DemoAccountState, type DemoStorage } from './account';
import { demoMediaLibrary, demoMxc, type DemoMedia } from './media';
import {
  DEMO_SERVER,
  buildDemoWorld,
  demoCredentials,
  demoDirect,
  demoMutedRooms,
  demoProfiles,
  demoRooms,
  demoUsers,
  DEMO_BASE_URL,
  type DemoEvent,
  type DemoInvite,
  type DemoRoom,
} from './fixtures';

/** Сколько Вера «печатает» в ответ на сообщение в «Выходных». */
export const DEMO_TYPING_MS = 2_500;

/** Текст, который в демо не уходит с первого раза. */
export const DEMO_SEND_FAILS_ONCE = 'Сбой отправки';

export type DemoVariant = 'full' | 'password-only' | 'sso-only' | 'slow';

export interface DemoServerOptions {
  variant?: DemoVariant;
  /** «Сейчас» для меток времени — тестам нужно постоянное. */
  now?: number;
  /** Сколько сообщений каждой комнаты отдаёт первая синхронизация. */
  initialTimelineLimit?: number;
  /** Задержка ответа в варианте `slow`, мс. */
  slowDelayMs?: number;
  /** Где держать аккаунт между загрузками страницы. Нет — в памяти. */
  storage?: DemoStorage;
}

type Handler = (request: DemoRequest) => Promise<Response> | Response;

interface DemoRequest {
  method: string;
  /** Устройство, чей токен пришёл в `Authorization`. */
  deviceId: string | undefined;
  url: URL;
  params: string[];
  body: unknown;
  signal: AbortSignal | undefined;
}

/** Токен устройства: `demo-token-<deviceId>`. По нему сервер знает, кто спрашивает. */
const tokenFor = (deviceId: string) => `demo-token-${deviceId}`;
/** Сколько длинный опрос ждёт, если нового нет. SDK просит 30 секунд; демо не нужно столько. */
const LONG_POLL_CAP_MS = 5_000;

export class DemoHomeserver {
  readonly baseUrl = DEMO_BASE_URL;
  readonly variant: DemoVariant;
  /** Запросы, которых сервер не узнал: `METHOD /path`. Тест держит список пустым. */
  readonly unknown: string[] = [];

  private readonly rooms: Map<string, DemoRoom>;
  private invites: DemoInvite[];
  private readonly initialLimit: number;
  private readonly slowDelayMs: number;
  private readonly filters = new Map<string, unknown>();
  private readonly routes: Array<[string, RegExp, Handler]>;
  private batch = 0;
  /** Устройства, ключи, данные аккаунта, резервная копия — то, что переживает устройство. */
  private readonly account: DemoAccountState;
  private readonly storage: DemoStorage | undefined;
  /** Данные аккаунта, изменённые с прошлой синхронизации. */
  private pendingAccountData: Array<{ type: string; content: unknown }> = [];
  /** Что отдать следующей синхронизацией: вход по приглашению, выход, отметки о прочтении. */
  private pending: Array<Record<string, unknown>> = [];
  private wake: (() => void) | undefined;
  private readonly sent = new Map<string, string>();
  private sentCount = 0;
  private readonly failedOnce = new Set<string>();
  /** Push-правила Алисы — меняются из настроек уведомлений комнаты. */
  private readonly rules = this.pushRules();
  private readonly profiles: Record<string, { displayname: string; avatar_url?: string }> = structuredClone(demoProfiles);
  private nextRoom = 0;
  /** mediaId → байты: нарисованные фикстуры и то, что загрузили. */
  private readonly media: Map<string, DemoMedia> = demoMediaLibrary();
  private nextMedia = 0;

  constructor(options: DemoServerOptions = {}) {
    this.variant = options.variant ?? 'full';
    this.initialLimit = options.initialTimelineLimit ?? 20;
    this.slowDelayMs = options.slowDelayMs ?? 1_500;
    this.storage = options.storage;
    this.account = this.storage?.load() ?? emptyAccount();
    const world = buildDemoWorld(options.now ?? Date.now());
    this.rooms = new Map(world.rooms.map((room) => [room.roomId, room]));
    this.invites = world.invites;

    const c = '/_matrix/client';
    this.routes = [
      ['GET', /^\/\.well-known\/matrix\/client$/, () => json(200, { 'm.homeserver': { base_url: DEMO_BASE_URL } })],
      ['GET', re(`${c}/versions`), () => this.versions()],
      // OAuth 2.0 (MAS) демо не умеет: ответ «не поддерживается» — это знание, а не незнание.
      ['GET', re(`${c}/v1/auth_metadata`), () => unrecognized()],
      ['GET', re(`${c}/unstable/org.matrix.msc2965/auth_metadata`), () => unrecognized()],
      ['GET', re(`${c}/v1/auth_issuer`), () => unrecognized()],
      ['GET', re(`${c}/unstable/org.matrix.msc2965/auth_issuer`), () => unrecognized()],
      ['GET', re(`${c}/v3/login`), () => this.loginFlows()],
      ['POST', re(`${c}/v3/login`), (r) => this.login(r)],
      ['POST', re(`${c}/v3/logout`), () => json(200, {})],
      ['GET', re(`${c}/v3/account/whoami`), (r) => json(200, { user_id: demoUsers.alice, device_id: r.deviceId })],
      ['GET', re(`${c}/v3/capabilities`), () => this.capabilities()],
      ['GET', re(`${c}/v3/pushrules/?`), () => json(200, this.rules)],
      ['PUT', re(`${c}/v3/pushrules/global/(override|room|sender|content|underride)/([^/]+)`), (r) => this.putPushRule(r)],
      ['DELETE', re(`${c}/v3/pushrules/global/(override|room|sender|content|underride)/([^/]+)`), (r) => this.deletePushRule(r)],
      ['POST', re(`${c}/v3/createRoom`), (r) => this.createRoom(r)],
      ['POST', re(`${c}/v3/rooms/([^/]+)/invite`), (r) => this.membership(r, 'invite')],
      ['POST', re(`${c}/v3/rooms/([^/]+)/kick`), (r) => this.membership(r, 'leave')],
      ['POST', re(`${c}/v3/rooms/([^/]+)/ban`), (r) => this.membership(r, 'ban')],
      ['PUT', re(`${c}/v3/profile/([^/]+)/(displayname|avatar_url)`), (r) => this.putProfile(r)],
      ['GET', re(`${c}/v3/devices`), () => this.devices()],
      ['POST', re(`${c}/v3/user/([^/]+)/filter`), (r) => this.createFilter(r)],
      ['GET', re(`${c}/v3/user/([^/]+)/filter/([^/]+)`), (r) => this.getFilter(r)],
      ['GET', re(`${c}/v3/sync`), (r) => this.sync(r)],
      ['GET', re(`${c}/v3/profile/([^/]+)`), (r) => this.profile(r)],
      ['GET', re(`${c}/v3/rooms/([^/]+)/messages`), (r) => this.messages(r)],
      ['POST', re(`${c}/v3/join/([^/]+)`), (r) => this.join(r.params[0]!)],
      ['POST', re(`${c}/v3/rooms/([^/]+)/join`), (r) => this.join(r.params[0]!)],
      ['POST', re(`${c}/v3/rooms/([^/]+)/leave`), (r) => this.leave(r.params[0]!)],
      ['POST', re(`${c}/v3/rooms/([^/]+)/receipt/([^/]+)/([^/]+)`), (r) => this.receipt(r.params[0]!, r.params[2]!)],
      ['POST', re(`${c}/v3/rooms/([^/]+)/read_markers`), (r) => this.readMarkers(r)],
      ['PUT', re(`${c}/v3/rooms/([^/]+)/send/([^/]+)/([^/]+)`), (r) => this.send(r)],
      ['PUT', re(`${c}/v3/rooms/([^/]+)/redact/([^/]+)/([^/]+)`), (r) => this.redact(r)],
      ['PUT', re(`${c}/v3/rooms/([^/]+)/state/([^/]+)/?([^/]*)`), (r) => this.putState(r)],
      ['GET', re(`${c}/v3/rooms/([^/]+)/event/([^/]+)`), (r) => this.event(r)],
      ['GET', re(`${c}/v3/rooms/([^/]+)/members`), (r) => this.members(r.params[0]!)],
      ['GET', re(`${c}/v3/rooms/([^/]+)/joined_members`), (r) => this.joinedMembers(r.params[0]!)],
      ['PUT', re(`${c}/v3/rooms/([^/]+)/typing/([^/]+)`), () => json(200, {})],
      ['GET', re(`${c}/v1/media/config`), () => json(200, { 'm.upload.size': 50 * 1024 * 1024 })],
      ['POST', re('/_matrix/media/v3/upload'), (r) => this.uploadMedia(r)],
      ['GET', re(`${c}/v1/media/download/([^/]+)/([^/]+)(?:/[^/]*)?`), (r) => this.downloadMedia(r)],
      // «Миниатюра» в демо — сам оригинал: SVG масштабируется сам.
      ['GET', re(`${c}/v1/media/thumbnail/([^/]+)/([^/]+)`), (r) => this.downloadMedia(r)],
      ['GET', re(`${c}/v3/voip/turnServer`), () => json(200, {})],
      ['PUT', re(`${c}/v3/presence/([^/]+)/status`), () => json(200, {})],
      // Звонков (MatrixRTC) в демо нет — и SDK это спрашивает на старте.
      ['GET', re(`${c}/unstable/org.matrix.msc4143/rtc/transports`), () => unrecognized()],
      ['GET', re(`${c}/v1/rtc/transports`), () => unrecognized()],
      // Ключи. Демо не шифрует комнаты, но Rust-крипто поднимается и в нём — и спрашивает.
      ['POST', re(`${c}/v3/keys/upload`), (r) => this.uploadKeys(r)],
      ['POST', re(`${c}/v3/keys/query`), (r) => this.queryKeys(r)],
      ['POST', re(`${c}/v3/keys/claim`), () => json(200, { one_time_keys: {}, failures: {} })],
      ['POST', re(`${c}/v3/keys/device_signing/upload`), (r) => this.uploadCrossSigning(r)],
      ['POST', re(`${c}/v3/keys/signatures/upload`), (r) => this.uploadSignatures(r)],
      ['PUT', re(`${c}/v3/sendToDevice/([^/]+)/([^/]+)`), () => json(200, {})],
      // Бэкапа ключей нет. Это ответ «бэкапа нет», а не «не знаю»: перепутать их — значит
      // создать новый бэкап поверх живого (см. план, «Восстановление переписки»).
      ['GET', re(`${c}/v3/room_keys/version`), () => this.backupVersion(undefined)],
      ['GET', re(`${c}/v3/room_keys/version/([^/]+)`), (r) => this.backupVersion(r.params[0])],
      ['POST', re(`${c}/v3/room_keys/version`), (r) => this.createBackup(r)],
      ['PUT', re(`${c}/v3/room_keys/version/([^/]+)`), (r) => this.updateBackup(r)],
      ['DELETE', re(`${c}/v3/room_keys/version/([^/]+)`), (r) => this.deleteBackup(r.params[0]!)],
      ['PUT', re(`${c}/v3/room_keys/keys`), (r) => this.putBackupKeys(r)],
      ['GET', re(`${c}/v3/room_keys/keys`), (r) => this.getBackupKeys(r)],
      ['GET', re(`${c}/v3/user/([^/]+)/account_data/([^/]+)`), (r) => this.getAccountData(r.params[1]!)],
      ['PUT', re(`${c}/v3/user/([^/]+)/account_data/([^/]+)`), (r) => this.putAccountData(r.params[1]!, r.body)],
    ];
  }

  /** Подменный `fetch` для `createClient({ fetchFn })`. */
  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    // Как у сети: ответ — не раньше следующей макрозадачи. Без этого демо отвечало бы на одних
    // микрозадачах, и цикл исходящих запросов Rust-крипто не отдавал бы очередь таймерам —
    // а на таймерах держится длинный опрос, которого ждёт, например, запись данных аккаунта.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = new Request(input, init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.origin !== DEMO_BASE_URL) {
      // Демо никуда, кроме себя, не ходит — и не даёт SDK уйти в сеть.
      this.unknown.push(`${method} ${url.origin}${url.pathname}`);
      return json(404, { errcode: 'M_NOT_FOUND', error: 'Demo server does not leave itself' });
    }

    // Загрузка медиа — байты, а не текст: разобрать её как строку — испортить.
    const binary = url.pathname === '/_matrix/media/v3/upload';
    const text = method === 'GET' || method === 'HEAD' || binary ? '' : await request.text();
    let body: unknown = binary ? { bytes: new Uint8Array(await request.arrayBuffer()), type: request.headers.get('Content-Type') ?? 'application/octet-stream' } : undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? url.searchParams.get('access_token') ?? '';
    const deviceId = token.startsWith('demo-token-') ? token.slice('demo-token-'.length) : undefined;

    if (this.variant === 'slow') await delay(this.slowDelayMs, init?.signal ?? undefined);

    for (const [routeMethod, pattern, handler] of this.routes) {
      if (routeMethod !== method) continue;
      const match = pattern.exec(url.pathname);
      if (!match) continue;
      return handler({
        method,
        deviceId,
        url,
        params: match.slice(1).map((p) => decodeURIComponent(p ?? '')),
        body,
        signal: init?.signal ?? undefined,
      });
    }

    this.unknown.push(`${method} ${url.pathname}`);
    return unrecognized();
  };

  private versions(): Response {
    return json(200, {
      versions: ['v1.1', 'v1.2', 'v1.3', 'v1.4', 'v1.5', 'v1.6', 'v1.7', 'v1.8', 'v1.9', 'v1.10', 'v1.11', 'v1.12'],
      unstable_features: {},
    });
  }

  private loginFlows(): Response {
    const flows: Array<Record<string, unknown>> = [];
    if (this.variant !== 'sso-only') flows.push({ type: 'm.login.password' });
    if (this.variant !== 'password-only') {
      flows.push({ type: 'm.login.sso', identity_providers: [{ id: 'demo', name: 'Demo SSO' }] });
      flows.push({ type: 'm.login.token' });
    }
    return json(200, { flows });
  }

  private login({ body }: DemoRequest): Response {
    const request = (body ?? {}) as {
      type?: string;
      password?: string;
      identifier?: { type?: string; user?: string };
      user?: string;
      token?: string;
    };
    const ok =
      request.type === 'm.login.password'
        ? this.variant !== 'sso-only' &&
          localpart(request.identifier?.user ?? request.user ?? '') === demoCredentials.user &&
          request.password === demoCredentials.password
        : request.type === 'm.login.token'
          ? this.variant !== 'password-only' && request.token === 'demo-login-token'
          : false;
    if (!ok) return json(403, { errcode: 'M_FORBIDDEN', error: 'Invalid username or password' });
    // Каждый вход — новое устройство, как у настоящего сервера: иначе второй вход после
    // выхода столкнулся бы с ключами прошлого.
    const deviceId = `DEMO${String(this.account.nextDevice++).padStart(3, '0')}`;
    this.account.devices[deviceId] = { oneTimeKeys: 0 };
    this.save();
    return json(200, {
      user_id: demoUsers.alice,
      access_token: tokenFor(deviceId),
      device_id: deviceId,
      well_known: { 'm.homeserver': { base_url: DEMO_BASE_URL } },
    });
  }

  private save(): void {
    this.storage?.save(this.account);
  }

  private uploadKeys({ body, deviceId }: DemoRequest): Response {
    const request = (body ?? {}) as { device_keys?: Record<string, unknown>; one_time_keys?: Record<string, unknown> };
    const device = (this.account.devices[deviceId ?? ''] ??= { oneTimeKeys: 0 });
    if (request.device_keys) device.keys = request.device_keys;
    device.oneTimeKeys += Object.keys(request.one_time_keys ?? {}).length;
    this.save();
    return json(200, { one_time_key_counts: { signed_curve25519: device.oneTimeKeys } });
  }

  /**
   * Ключи — только тех, о ком спросили. Ответить ключами Алисы на вопрос об Ане — значит
   * подсунуть Rust-крипто чужую (старую) личность посреди «Начать заново», и оно выбросит
   * только что созданные закрытые ключи как не совпавшие.
   */
  private queryKeys({ body }: DemoRequest): Response {
    const asked = Object.keys(((body ?? {}) as { device_keys?: Record<string, unknown> }).device_keys ?? {});
    const device_keys: Record<string, Record<string, unknown>> = {};
    for (const user of asked) device_keys[user] = {};
    const aboutAlice = asked.includes(demoUsers.alice);
    if (aboutAlice) {
      for (const [id, device] of Object.entries(this.account.devices)) if (device.keys) device_keys[demoUsers.alice]![id] = device.keys;
    }
    const byUser = (key: string) => (aboutAlice && this.account.crossSigning[key] ? { [demoUsers.alice]: this.account.crossSigning[key] } : {});
    return json(200, {
      device_keys,
      master_keys: byUser('master_key'),
      self_signing_keys: byUser('self_signing_key'),
      user_signing_keys: byUser('user_signing_key'),
      failures: {},
    });
  }

  /**
   * Ключи кросс-подписи. Первые — без вопросов (MSC3967), а заменить существующие — только
   * с паролем, как у настоящего сервера: так в демо видно и «Начать заново» с паролем.
   */
  private uploadCrossSigning({ body }: DemoRequest): Response {
    const keys = (body ?? {}) as Record<string, unknown> & { auth?: { type?: string; password?: string; session?: string } };
    const replacing = !!this.account.crossSigning['master_key'];
    if (replacing) {
      const auth = keys.auth;
      const ok = auth?.type === 'm.login.password' && auth.password === demoCredentials.password;
      if (!ok) {
        return json(401, {
          flows: [{ stages: ['m.login.password'] }],
          params: {},
          session: 'demo-uia',
          ...(auth ? { errcode: 'M_FORBIDDEN', error: 'Invalid password' } : {}),
        });
      }
    }
    for (const name of ['master_key', 'self_signing_key', 'user_signing_key']) {
      if (keys[name]) this.account.crossSigning[name] = keys[name] as Record<string, unknown>;
    }
    this.save();
    return json(200, {});
  }

  private uploadSignatures({ body }: DemoRequest): Response {
    const uploads = (body ?? {}) as Record<string, Record<string, { signatures?: Record<string, Record<string, string>> }>>;
    for (const [userId, signed] of Object.entries(uploads)) mergeSignatures(this.account, userId, signed);
    this.save();
    return json(200, { failures: {} });
  }

  // ————— Данные аккаунта —————

  private getAccountData(type: string): Response {
    const content = this.account.accountData[type];
    return content === undefined ? json(404, { errcode: 'M_NOT_FOUND', error: 'Account data not found' }) : json(200, content);
  }

  private putAccountData(type: string, content: unknown): Response {
    this.account.accountData[type] = content;
    this.save();
    this.pendingAccountData.push({ type, content });
    this.wake?.();
    return json(200, {});
  }

  // ————— Резервная копия ключей —————

  private latestBackup() {
    return this.account.backups.at(-1);
  }

  private backupInfo(backup: { version: string; algorithm: string; auth_data: unknown; etag: number; rooms: Record<string, { sessions: Record<string, unknown> }> }) {
    const count = Object.values(backup.rooms).reduce((n, room) => n + Object.keys(room.sessions).length, 0);
    return { version: backup.version, algorithm: backup.algorithm, auth_data: backup.auth_data, etag: String(backup.etag), count };
  }

  private backupVersion(version: string | undefined): Response {
    const backup = version ? this.account.backups.find((b) => b.version === version) : this.latestBackup();
    // «Бэкапа нет» — это 404 M_NOT_FOUND, и это ответ, а не «не знаю» (см. план).
    if (!backup) return json(404, { errcode: 'M_NOT_FOUND', error: 'No current backup version' });
    return json(200, this.backupInfo(backup));
  }

  private createBackup({ body }: DemoRequest): Response {
    const request = (body ?? {}) as { algorithm?: string; auth_data?: Record<string, unknown> };
    const version = String(this.account.backups.length + 1);
    this.account.backups.push({ version, algorithm: request.algorithm ?? '', auth_data: request.auth_data ?? {}, etag: 0, rooms: {} });
    this.save();
    return json(200, { version });
  }

  private updateBackup({ params, body }: DemoRequest): Response {
    const backup = this.account.backups.find((b) => b.version === params[0]);
    if (!backup) return json(404, { errcode: 'M_NOT_FOUND', error: 'No such backup' });
    backup.auth_data = ((body ?? {}) as { auth_data?: Record<string, unknown> }).auth_data ?? backup.auth_data;
    this.save();
    return json(200, {});
  }

  private deleteBackup(version: string): Response {
    this.account.backups = this.account.backups.filter((b) => b.version !== version);
    this.save();
    return json(200, {});
  }

  private putBackupKeys({ url, body }: DemoRequest): Response {
    const backup = this.account.backups.find((b) => b.version === url.searchParams.get('version'));
    const latest = this.latestBackup();
    if (!backup || backup !== latest) {
      return json(403, { errcode: 'M_WRONG_ROOM_KEYS_VERSION', error: 'Wrong backup version', current_version: latest?.version });
    }
    const rooms = ((body ?? {}) as { rooms?: Record<string, { sessions?: Record<string, unknown> }> }).rooms ?? {};
    for (const [roomId, room] of Object.entries(rooms)) {
      const target = (backup.rooms[roomId] ??= { sessions: {} });
      Object.assign(target.sessions, room.sessions ?? {});
    }
    backup.etag++;
    this.save();
    const info = this.backupInfo(backup);
    return json(200, { count: info.count, etag: info.etag });
  }

  private getBackupKeys({ url }: DemoRequest): Response {
    const backup = this.account.backups.find((b) => b.version === url.searchParams.get('version'));
    if (!backup) return json(404, { errcode: 'M_NOT_FOUND', error: 'No such backup' });
    return json(200, { rooms: backup.rooms });
  }

  private capabilities(): Response {
    return json(200, {
      capabilities: {
        'm.change_password': { enabled: this.variant !== 'sso-only' },
        'm.room_versions': { default: '10', available: { '10': 'stable', '11': 'stable' } },
        'm.set_displayname': { enabled: true },
        'm.set_avatar_url': { enabled: true },
      },
    });
  }

  private pushRules() {
    return {
      global: {
        override: [
          ...demoMutedRooms.map((roomId) => ({
            rule_id: roomId,
            default: false,
            enabled: true,
            conditions: [{ kind: 'event_match', key: 'room_id', pattern: roomId }],
            actions: [],
          })),
          {
            rule_id: '.m.rule.master',
            default: true,
            enabled: false,
            conditions: [],
            actions: [],
          },
          {
            rule_id: '.m.rule.is_user_mention',
            default: true,
            enabled: true,
            conditions: [{ kind: 'event_property_contains', key: 'content.m\\.mentions.user_ids', value: demoUsers.alice }],
            actions: ['notify', { set_tweak: 'highlight' }, { set_tweak: 'sound', value: 'default' }],
          },
        ],
        content: [],
        room: [],
        sender: [],
        underride: [
          {
            rule_id: '.m.rule.room_one_to_one',
            default: true,
            enabled: true,
            conditions: [
              { kind: 'room_member_count', is: '2' },
              { kind: 'event_match', key: 'type', pattern: 'm.room.message' },
            ],
            actions: ['notify', { set_tweak: 'sound', value: 'default' }],
          },
          {
            rule_id: '.m.rule.message',
            default: true,
            enabled: true,
            conditions: [{ kind: 'event_match', key: 'type', pattern: 'm.room.message' }],
            actions: ['notify'],
          },
        ],
      },
    };
  }

  private createFilter({ body }: DemoRequest): Response {
    const id = String(this.filters.size + 1);
    this.filters.set(id, body ?? {});
    return json(200, { filter_id: id });
  }

  private getFilter({ params }: DemoRequest): Response {
    const filter = this.filters.get(params[1] ?? '');
    return filter ? json(200, filter) : json(404, { errcode: 'M_NOT_FOUND', error: 'No such filter' });
  }

  private async sync({ url, signal }: DemoRequest): Promise<Response> {
    const since = url.searchParams.get('since');
    if (since) {
      // Нового ничего нет — держим длинный опрос, как настоящий сервер, но недолго;
      // появилось (вошли по приглашению, прочитали) — отвечаем сразу.
      if (this.pending.length === 0 && this.pendingAccountData.length === 0) {
        const timeout = Number(url.searchParams.get('timeout') ?? 0);
        await Promise.race([
          delay(Math.min(timeout, LONG_POLL_CAP_MS), signal),
          new Promise<void>((resolve) => (this.wake = resolve)),
        ]);
        this.wake = undefined;
      }
      return json(200, this.incrementalSync());
    }
    return json(200, this.initialSync());
  }

  private initialSync() {
    const join: Record<string, unknown> = {};
    for (const room of this.rooms.values()) {
      const start = Math.max(0, room.timeline.length - this.initialLimit);
      join[room.roomId] = {
        state: { events: room.state.map((e) => withDefaults(e)) },
        timeline: {
          events: room.timeline.slice(start).map((e) => withDefaults(e)),
          limited: start > 0,
          prev_batch: `t${start}`,
        },
        ephemeral: { events: room.readUpTo ? [receiptEvent(room.readUpTo)] : [] },
        account_data: { events: room.tags ? [{ type: 'm.tag', content: { tags: room.tags } }] : [] },
        unread_notifications: {
          notification_count: room.unread?.notifications ?? 0,
          highlight_count: room.unread?.highlights ?? 0,
        },
        summary: {
          'm.joined_member_count': room.state.filter(
            (e) => e.type === 'm.room.member' && e.content['membership'] === 'join',
          ).length,
          'm.invited_member_count': 0,
        },
      };
    }
    const invite: Record<string, unknown> = {};
    for (const room of this.invites) {
      invite[room.roomId] = { invite_state: { events: room.inviteState } };
    }
    return {
      next_batch: `s${++this.batch}`,
      rooms: { join, invite, leave: {} },
      account_data: {
        events: [
          { type: 'm.direct', content: demoDirect },
          ...Object.entries(this.account.accountData).map(([type, content]) => ({ type, content })),
        ],
      },
      presence: { events: [] },
      to_device: { events: [] },
      device_lists: { changed: [], left: [] },
      device_one_time_keys_count: {},
    };
  }

  private incrementalSync() {
    const join: Record<string, unknown> = {};
    const leave: Record<string, unknown> = {};
    for (const change of this.pending.splice(0)) {
      const roomId = change['roomId'] as string;
      if (change['kind'] === 'leave') leave[roomId] = change['body'];
      else join[roomId] = mergeJoin(join[roomId] as Record<string, unknown> | undefined, change['body'] as Record<string, unknown>);
    }
    const accountData = this.pendingAccountData.splice(0);
    return {
      next_batch: `s${++this.batch}`,
      rooms: { join, invite: {}, leave },
      ...(accountData.length ? { account_data: { events: accountData } } : {}),
    };
  }

  private enqueue(change: Record<string, unknown>): void {
    this.pending.push(change);
    this.wake?.();
  }

  /** Вход по приглашению: комната становится обычной, с Алисой среди участников. */
  private join(roomIdOrAlias: string): Response {
    const invite = this.invites.find((i) => i.roomId === roomIdOrAlias);
    if (!invite && !this.rooms.has(roomIdOrAlias)) {
      return json(404, { errcode: 'M_NOT_FOUND', error: 'No such room' });
    }
    if (invite) {
      this.invites = this.invites.filter((i) => i !== invite);
      const joinEvent: DemoEvent = {
        type: 'm.room.member',
        sender: demoUsers.alice,
        state_key: demoUsers.alice,
        content: { membership: 'join', displayname: demoProfiles[demoUsers.alice]?.displayname },
        event_id: `$join-${invite.roomId}-${this.batch}`,
        origin_server_ts: Date.now(),
      };
      const state = [
        { type: 'm.room.create', sender: invite.inviteState[0]?.sender ?? demoUsers.alice, state_key: '', content: { room_version: '10' }, event_id: `$create-${invite.roomId}` },
        ...invite.inviteState
          .filter((e) => !(e.type === 'm.room.member' && e.state_key === demoUsers.alice))
          .map((e, i) => ({ ...e, event_id: e.event_id ?? `$invite-state-${i}-${invite.roomId}` })),
      ];
      this.rooms.set(invite.roomId, { roomId: invite.roomId, state: [...state, joinEvent], timeline: [joinEvent] });
      this.enqueue({
        kind: 'join',
        roomId: invite.roomId,
        body: {
          state: { events: state.map((e) => withDefaults(e)) },
          timeline: { events: [withDefaults(joinEvent)], limited: false, prev_batch: 't0' },
        },
      });
    }
    return json(200, { room_id: roomIdOrAlias });
  }

  /** Выход или отказ от приглашения. */
  private leave(roomId: string): Response {
    const known = this.rooms.has(roomId) || this.invites.some((i) => i.roomId === roomId);
    if (!known) return json(404, { errcode: 'M_NOT_FOUND', error: 'No such room' });
    this.rooms.delete(roomId);
    this.invites = this.invites.filter((i) => i.roomId !== roomId);
    const leaveEvent = {
      type: 'm.room.member',
      sender: demoUsers.alice,
      state_key: demoUsers.alice,
      content: { membership: 'leave' },
      event_id: `$leave-${roomId}-${this.batch}`,
      origin_server_ts: Date.now(),
      unsigned: {},
    };
    this.enqueue({ kind: 'leave', roomId, body: { state: { events: [] }, timeline: { events: [leaveEvent] } } });
    return json(200, {});
  }

  /**
   * Отправка. Событие ложится в историю и приходит обратно следующей синхронизацией с
   * `transaction_id` — так SDK узнаёт в нём свой local echo.
   *
   * Сообщение с текстом `DEMO_SEND_FAILS_ONCE` в первый раз не уходит (403, без повтора
   * со стороны SDK) — чтобы в демо было на чём увидеть «Не отправлено» и «Отправить заново».
   */
  private send({ params, body }: DemoRequest): Response {
    const [roomId, type, txnId] = params as [string, string, string];
    const room = this.rooms.get(roomId);
    if (!room) return json(403, { errcode: 'M_FORBIDDEN', error: 'Not in room' });
    const content = (body ?? {}) as Record<string, unknown>;
    if (content['body'] === DEMO_SEND_FAILS_ONCE && !this.failedOnce.has(roomId)) {
      this.failedOnce.add(roomId);
      return json(403, { errcode: 'M_FORBIDDEN', error: 'Demo: this message fails the first time' });
    }
    const existing = this.sent.get(`${roomId}|${txnId}`);
    if (existing) return json(200, { event_id: existing });
    const eventId = `$sent-${++this.sentCount}-${txnId}`;
    this.sent.set(`${roomId}|${txnId}`, eventId);
    const event: DemoEvent = {
      type,
      sender: demoUsers.alice,
      content,
      event_id: eventId,
      origin_server_ts: Date.now(),
    };
    this.append(roomId, event, txnId);
    if (type === 'm.room.message' && roomId === demoRooms.weekend) this.veraTypes(roomId);
    return json(200, { event_id: eventId });
  }

  /** Событие Алисы — в историю и в следующую синхронизацию, с её `transaction_id`. */
  private append(roomId: string, event: DemoEvent, txnId?: string): void {
    const room = this.rooms.get(roomId)!;
    room.timeline.push(event);
    if (event.state_key !== undefined) {
      room.state = [...room.state.filter((e) => !(e.type === event.type && e.state_key === event.state_key)), event];
    }
    room.readUpTo = event.event_id;
    const echoed = txnId ? { ...withDefaults(event), unsigned: { transaction_id: txnId } } : withDefaults(event);
    this.enqueue({ kind: 'join', roomId, body: { timeline: { events: [echoed], limited: false } } });
  }

  /**
   * В «Выходных» на сообщение Алисы Вера начинает печатать — и через пару секунд
   * перестаёт: так в демо видно «Вера печатает…».
   */
  private veraTypes(roomId: string): void {
    const typing = (userIds: string[]) =>
      this.enqueue({ kind: 'join', roomId, body: { ephemeral: { events: [{ type: 'm.typing', content: { user_ids: userIds } }] } } });
    typing([demoUsers.vera]);
    setTimeout(() => typing([]), DEMO_TYPING_MS);
  }

  /** Удаление: событие теряет содержимое у всех, в ленту приходит `m.room.redaction`. */
  private redact({ params, body }: DemoRequest): Response {
    const [roomId, target, txnId] = params as [string, string, string];
    const room = this.rooms.get(roomId);
    if (!room) return json(403, { errcode: 'M_FORBIDDEN', error: 'Not in room' });
    const existing = this.sent.get(`${roomId}|${txnId}`);
    if (existing) return json(200, { event_id: existing });
    const eventId = `$redaction-${++this.sentCount}-${txnId}`;
    this.sent.set(`${roomId}|${txnId}`, eventId);
    const reason = (body as { reason?: string } | undefined)?.reason;
    const redaction: DemoEvent = {
      type: 'm.room.redaction',
      sender: demoUsers.alice,
      content: { redacts: target, ...(reason ? { reason } : {}) },
      redacts: target,
      event_id: eventId,
      origin_server_ts: Date.now(),
    };
    // В истории — уже удалённым: подгруженное позже тоже должно быть пустым.
    room.timeline = room.timeline.map((e) =>
      e.event_id === target ? { ...e, content: {}, unsigned: { ...e.unsigned, redacted_because: withDefaults(redaction) } } : e,
    );
    this.append(roomId, redaction, txnId);
    return json(200, { event_id: eventId });
  }

  /** Состояние комнаты — в демо это закреплённые сообщения. */
  private putState({ params, body }: DemoRequest): Response {
    const [roomId, type, stateKey = ''] = params as [string, string, string?];
    const room = this.rooms.get(roomId);
    if (!room) return json(403, { errcode: 'M_FORBIDDEN', error: 'Not in room' });
    const eventId = `$state-${++this.sentCount}`;
    this.append(roomId, {
      type: decodeURIComponent(type),
      sender: demoUsers.alice,
      state_key: decodeURIComponent(stateKey),
      content: (body ?? {}) as Record<string, unknown>,
      event_id: eventId,
      origin_server_ts: Date.now(),
    });
    return json(200, { event_id: eventId });
  }

  // ————— Медиа —————

  private uploadMedia({ body }: DemoRequest): Response {
    const media = body as DemoMedia | undefined;
    if (!media?.bytes) return json(400, { errcode: 'M_BAD_JSON', error: 'No body' });
    const id = `upload-${++this.nextMedia}`;
    this.media.set(id, media);
    return json(200, { content_uri: demoMxc(id) });
  }

  private downloadMedia({ params }: DemoRequest): Response {
    const media = this.media.get(params[1] ?? '');
    if (!media) return json(404, { errcode: 'M_NOT_FOUND', error: 'Not found' });
    return new Response(media.bytes.slice(), {
      status: 200,
      headers: { 'Content-Type': media.type, 'Content-Length': String(media.bytes.byteLength) },
    });
  }

  // ————— Push-правила —————

  private putPushRule({ params, body }: DemoRequest): Response {
    const [kind, ruleId] = params as [string, string];
    const rule = { rule_id: ruleId, default: false, enabled: true, ...((body ?? {}) as Record<string, unknown>) };
    const list = (this.rules.global as Record<string, Array<{ rule_id: string }>>)[kind]!;
    const at = list.findIndex((r) => r.rule_id === ruleId);
    // Новое правило — первым: оно главнее прежних (как `before` без указания у сервера).
    if (at >= 0) list[at] = rule;
    else list.unshift(rule);
    this.rulesChanged();
    return json(200, {});
  }

  private deletePushRule({ params }: DemoRequest): Response {
    const [kind, ruleId] = params as [string, string];
    const global = this.rules.global as Record<string, Array<{ rule_id: string }>>;
    const before = global[kind]!.length;
    global[kind] = global[kind]!.filter((r) => r.rule_id !== ruleId);
    if (global[kind]!.length === before) return json(404, { errcode: 'M_NOT_FOUND', error: 'Push rule not found' });
    this.rulesChanged();
    return json(200, {});
  }

  private rulesChanged(): void {
    this.pendingAccountData.push({ type: 'm.push_rules', content: structuredClone(this.rules) });
    this.wake?.();
  }

  // ————— Комнаты: создание и участники —————

  private createRoom({ body }: DemoRequest): Response {
    const request = (body ?? {}) as {
      name?: string;
      preset?: string;
      is_direct?: boolean;
      invite?: string[];
      initial_state?: DemoEvent[];
    };
    const roomId = `!new-${++this.nextRoom}:${DEMO_SERVER}`;
    const invited = request.invite ?? [];
    const alice = demoUsers.alice;
    const at = Date.now();
    const stamp = (e: DemoEvent, i: number): DemoEvent => ({ ...e, event_id: `$${roomId.slice(1, roomId.indexOf(':'))}-${i}`, origin_server_ts: at + i });
    const trusted = request.preset === 'trusted_private_chat';
    const state: DemoEvent[] = [
      { type: 'm.room.create', sender: alice, state_key: '', content: { room_version: '10', creator: alice } },
      { type: 'm.room.member', sender: alice, state_key: alice, content: { membership: 'join', displayname: this.profiles[alice]?.displayname } },
      {
        type: 'm.room.power_levels',
        sender: alice,
        state_key: '',
        content: {
          users: Object.fromEntries([alice, ...(trusted ? invited : [])].map((u) => [u, 100])),
          users_default: 0,
          events_default: 0,
          state_default: 50,
          invite: 0,
          kick: 50,
          ban: 50,
          redact: 50,
        },
      },
      { type: 'm.room.join_rules', sender: alice, state_key: '', content: { join_rule: request.preset === 'public_chat' ? 'public' : 'invite' } },
      { type: 'm.room.history_visibility', sender: alice, state_key: '', content: { history_visibility: 'shared' } },
      ...(request.name ? [{ type: 'm.room.name', sender: alice, state_key: '', content: { name: request.name } }] : []),
      ...(request.initial_state ?? []).map((e) => ({ ...e, sender: alice, state_key: e.state_key ?? '' })),
      ...invited.map((u) => ({
        type: 'm.room.member',
        sender: alice,
        state_key: u,
        content: { membership: 'invite', displayname: this.profiles[u]?.displayname, ...(request.is_direct ? { is_direct: true } : {}) },
      })),
    ].map(stamp);
    this.rooms.set(roomId, { roomId, state, timeline: state });
    this.enqueue({
      kind: 'join',
      roomId,
      body: {
        state: { events: [] },
        timeline: { events: state.map((e) => withDefaults(e)), limited: false, prev_batch: 't0' },
        summary: { 'm.joined_member_count': 1, 'm.invited_member_count': invited.length },
      },
    });
    return json(200, { room_id: roomId });
  }

  /** Пригласить, исключить, заблокировать — событие участия от имени Алисы. */
  private membership({ params, body }: DemoRequest, membership: 'invite' | 'leave' | 'ban'): Response {
    const room = this.rooms.get(params[0] ?? '');
    if (!room) return json(403, { errcode: 'M_FORBIDDEN', error: 'Not in room' });
    const { user_id: userId, reason } = (body ?? {}) as { user_id?: string; reason?: string };
    if (!userId || !/^@[^:]+:.+$/.test(userId)) return json(400, { errcode: 'M_INVALID_PARAM', error: 'Bad user id' });
    if (membership === 'invite' && userId.endsWith(`:${DEMO_SERVER}`) && !this.profiles[userId]) {
      return json(404, { errcode: 'M_NOT_FOUND', error: 'No such user' });
    }
    this.append(room.roomId, {
      type: 'm.room.member',
      sender: demoUsers.alice,
      state_key: userId,
      content: { membership, ...(membership === 'invite' ? { displayname: this.profiles[userId]?.displayname } : {}), ...(reason ? { reason } : {}) },
      event_id: `$member-${++this.sentCount}`,
      origin_server_ts: Date.now(),
    });
    return json(200, {});
  }

  // ————— Профиль и устройства —————

  private putProfile({ params, body }: DemoRequest): Response {
    const [userId, field] = params as [string, 'displayname' | 'avatar_url'];
    if (userId !== demoUsers.alice) return json(403, { errcode: 'M_FORBIDDEN', error: 'Not yours' });
    const value = ((body ?? {}) as Record<string, string>)[field];
    const profile = (this.profiles[userId] ??= { displayname: 'Алиса' });
    if (field === 'displayname') profile.displayname = value ?? '';
    else if (value) profile.avatar_url = value;
    else delete profile.avatar_url;
    // Как настоящий сервер: новое имя и фото расходятся по всем комнатам событием участия.
    for (const room of this.rooms.values()) {
      const joined = room.state.some((e) => e.type === 'm.room.member' && e.state_key === userId && e.content['membership'] === 'join');
      if (!joined) continue;
      this.append(room.roomId, {
        type: 'm.room.member',
        sender: userId,
        state_key: userId,
        content: { membership: 'join', displayname: profile.displayname, ...(profile.avatar_url ? { avatar_url: profile.avatar_url } : {}) },
        event_id: `$profile-${++this.sentCount}`,
        origin_server_ts: Date.now(),
      });
    }
    return json(200, {});
  }

  private devices(): Response {
    const devices = Object.keys(this.account.devices).map((id) => ({ device_id: id, display_name: 'Iskra Web', last_seen_ts: Date.now() }));
    return json(200, { devices });
  }

  /** Одно событие по ID — закреплённое, которого нет среди загруженного. */
  private event({ params }: DemoRequest): Response {
    const room = this.rooms.get(params[0] ?? '');
    if (!room) return json(403, { errcode: 'M_FORBIDDEN', error: 'Not in room' });
    const id = decodeURIComponent(params[1] ?? '');
    const found = room.timeline.find((e) => e.event_id === id);
    return found ? json(200, { ...withDefaults(found), room_id: room.roomId }) : json(404, { errcode: 'M_NOT_FOUND', error: 'Event not found' });
  }

  private members(roomId: string): Response {
    const room = this.rooms.get(roomId);
    if (!room) return json(403, { errcode: 'M_FORBIDDEN', error: 'Not in room' });
    return json(200, { chunk: room.state.filter((e) => e.type === 'm.room.member').map((e) => withDefaults(e)) });
  }

  private joinedMembers(roomId: string): Response {
    const room = this.rooms.get(roomId);
    if (!room) return json(403, { errcode: 'M_FORBIDDEN', error: 'Not in room' });
    const joined: Record<string, unknown> = {};
    for (const e of room.state) {
      if (e.type === 'm.room.member' && e.content['membership'] === 'join') {
        joined[e.state_key!] = { display_name: e.content['displayname'] };
      }
    }
    return json(200, { joined });
  }

  private receipt(roomId: string, eventId: string): Response {
    const room = this.rooms.get(roomId);
    if (!room) return json(403, { errcode: 'M_FORBIDDEN', error: 'Not in room' });
    room.readUpTo = eventId;
    room.unread = { notifications: 0, highlights: 0 };
    this.enqueue({
      kind: 'join',
      roomId,
      body: {
        ephemeral: { events: [receiptEvent(eventId)] },
        unread_notifications: { notification_count: 0, highlight_count: 0 },
      },
    });
    return json(200, {});
  }

  private readMarkers({ params, body }: DemoRequest): Response {
    const read = (body as Record<string, unknown> | undefined)?.['m.read'];
    if (typeof read === 'string') return this.receipt(params[0]!, read);
    return json(200, {});
  }

  private profile({ params }: DemoRequest): Response {
    const profile = this.profiles[params[0] ?? ''];
    return profile ? json(200, profile) : json(404, { errcode: 'M_NOT_FOUND', error: 'Profile not found' });
  }

  /** `/messages` назад по истории: токен `t<n>` — «всё, что раньше n-го события». */
  private messages({ params, url }: DemoRequest): Response {
    const room = this.rooms.get(params[0] ?? '');
    if (!room) return json(403, { errcode: 'M_FORBIDDEN', error: 'Not in room' });
    const dir = url.searchParams.get('dir') ?? 'b';
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 10), 100);
    const from = url.searchParams.get('from');
    const position = from?.startsWith('t') ? Number(from.slice(1)) : room.timeline.length;

    if (dir === 'f') {
      const end = Math.min(room.timeline.length, position + limit);
      return json(200, {
        chunk: room.timeline.slice(position, end).map((e) => withDefaults(e)),
        start: `t${position}`,
        ...(end < room.timeline.length ? { end: `t${end}` } : {}),
      });
    }

    const start = Math.max(0, position - limit);
    const chunk = room.timeline.slice(start, position).reverse().map((e) => withDefaults(e));
    return json(200, {
      chunk,
      start: `t${position}`,
      // Нет `end` — истории больше нет, и SDK это понимает.
      ...(start > 0 ? { end: `t${start}` } : {}),
      // Состояние комнаты в начале истории — когда дошли до начала.
      ...(start === 0 ? { state: room.state.map((e) => withDefaults(e)) } : {}),
    });
  }
}

function receiptEvent(eventId: string) {
  return {
    type: 'm.receipt',
    content: { [eventId]: { 'm.read': { [demoUsers.alice]: { ts: Date.now() } } } },
  };
}

function mergeJoin(a: Record<string, unknown> | undefined, b: Record<string, unknown>): Record<string, unknown> {
  if (!a) return b;
  const merged: Record<string, unknown> = { ...a, ...b };
  for (const key of ['state', 'timeline', 'ephemeral', 'account_data']) {
    const left = (a[key] as { events?: unknown[] } | undefined)?.events ?? [];
    const right = (b[key] as { events?: unknown[] } | undefined)?.events ?? [];
    if (left.length || right.length) merged[key] = { ...(a[key] as object), ...(b[key] as object), events: [...left, ...right] };
  }
  return merged;
}

function withDefaults(event: DemoEvent): DemoEvent {
  return { origin_server_ts: 0, unsigned: {}, ...event };
}

function localpart(user: string): string {
  return user.replace(/^@/, '').split(':')[0] ?? '';
}

function re(path: string): RegExp {
  return new RegExp(`^${path}$`);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unrecognized(): Response {
  return json(404, { errcode: 'M_UNRECOGNIZED', error: 'Unrecognized request' });
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
