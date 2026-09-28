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
import {
  buildDemoWorld,
  demoCredentials,
  demoDirect,
  demoMutedRooms,
  demoProfiles,
  demoUsers,
  DEMO_BASE_URL,
  type DemoEvent,
  type DemoInvite,
  type DemoRoom,
} from './fixtures';

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
}

type Handler = (request: DemoRequest) => Promise<Response> | Response;

interface DemoRequest {
  method: string;
  url: URL;
  params: string[];
  body: unknown;
  signal: AbortSignal | undefined;
}

const DEVICE_ID = 'DEMODEVICE';
const ACCESS_TOKEN = 'demo-access-token';
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
  /** Ключи устройства, которые загрузило Rust-крипто: демо честно отдаёт их обратно. */
  private deviceKeys: Record<string, unknown> | undefined;
  private crossSigning: Record<string, unknown> = {};
  private oneTimeKeys = 0;
  /** Что отдать следующей синхронизацией: вход по приглашению, выход, отметки о прочтении. */
  private pending: Array<Record<string, unknown>> = [];
  private wake: (() => void) | undefined;
  private readonly sent = new Map<string, string>();
  private sentCount = 0;
  private readonly failedOnce = new Set<string>();

  constructor(options: DemoServerOptions = {}) {
    this.variant = options.variant ?? 'full';
    this.initialLimit = options.initialTimelineLimit ?? 20;
    this.slowDelayMs = options.slowDelayMs ?? 1_500;
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
      ['GET', re(`${c}/v3/account/whoami`), () => json(200, { user_id: demoUsers.alice, device_id: DEVICE_ID })],
      ['GET', re(`${c}/v3/capabilities`), () => this.capabilities()],
      ['GET', re(`${c}/v3/pushrules/?`), () => json(200, this.pushRules())],
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
      ['GET', re(`${c}/v3/rooms/([^/]+)/members`), (r) => this.members(r.params[0]!)],
      ['GET', re(`${c}/v3/rooms/([^/]+)/joined_members`), (r) => this.joinedMembers(r.params[0]!)],
      ['PUT', re(`${c}/v3/rooms/([^/]+)/typing/([^/]+)`), () => json(200, {})],
      ['GET', re(`${c}/v1/media/config`), () => json(200, { 'm.upload.size': 50 * 1024 * 1024 })],
      ['GET', re(`${c}/v3/voip/turnServer`), () => json(200, {})],
      ['PUT', re(`${c}/v3/presence/([^/]+)/status`), () => json(200, {})],
      // Звонков (MatrixRTC) в демо нет — и SDK это спрашивает на старте.
      ['GET', re(`${c}/unstable/org.matrix.msc4143/rtc/transports`), () => unrecognized()],
      ['GET', re(`${c}/v1/rtc/transports`), () => unrecognized()],
      // Ключи. Демо не шифрует комнаты, но Rust-крипто поднимается и в нём — и спрашивает.
      ['POST', re(`${c}/v3/keys/upload`), (r) => this.uploadKeys(r)],
      ['POST', re(`${c}/v3/keys/query`), () => this.queryKeys()],
      ['POST', re(`${c}/v3/keys/claim`), () => json(200, { one_time_keys: {}, failures: {} })],
      ['POST', re(`${c}/v3/keys/device_signing/upload`), (r) => this.uploadCrossSigning(r)],
      ['POST', re(`${c}/v3/keys/signatures/upload`), () => json(200, { failures: {} })],
      ['PUT', re(`${c}/v3/sendToDevice/([^/]+)/([^/]+)`), () => json(200, {})],
      // Бэкапа ключей нет. Это ответ «бэкапа нет», а не «не знаю»: перепутать их — значит
      // создать новый бэкап поверх живого (см. план, «Восстановление переписки»).
      ['GET', re(`${c}/v3/room_keys/version`), () => json(404, { errcode: 'M_NOT_FOUND', error: 'No current backup version' })],
      ['GET', re(`${c}/v3/user/([^/]+)/account_data/([^/]+)`), () => json(404, { errcode: 'M_NOT_FOUND', error: 'Account data not found' })],
    ];
  }

  /** Подменный `fetch` для `createClient({ fetchFn })`. */
  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.origin !== DEMO_BASE_URL) {
      // Демо никуда, кроме себя, не ходит — и не даёт SDK уйти в сеть.
      this.unknown.push(`${method} ${url.origin}${url.pathname}`);
      return json(404, { errcode: 'M_NOT_FOUND', error: 'Demo server does not leave itself' });
    }

    const text = method === 'GET' || method === 'HEAD' ? '' : await request.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (this.variant === 'slow') await delay(this.slowDelayMs, init?.signal ?? undefined);

    for (const [routeMethod, pattern, handler] of this.routes) {
      if (routeMethod !== method) continue;
      const match = pattern.exec(url.pathname);
      if (!match) continue;
      return handler({
        method,
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
    return json(200, {
      user_id: demoUsers.alice,
      access_token: ACCESS_TOKEN,
      device_id: DEVICE_ID,
      well_known: { 'm.homeserver': { base_url: DEMO_BASE_URL } },
    });
  }

  private uploadKeys({ body }: DemoRequest): Response {
    const request = (body ?? {}) as { device_keys?: Record<string, unknown>; one_time_keys?: Record<string, unknown> };
    if (request.device_keys) this.deviceKeys = request.device_keys;
    this.oneTimeKeys += Object.keys(request.one_time_keys ?? {}).length;
    return json(200, { one_time_key_counts: { signed_curve25519: this.oneTimeKeys } });
  }

  private queryKeys(): Response {
    return json(200, {
      device_keys: { [demoUsers.alice]: this.deviceKeys ? { [DEVICE_ID]: this.deviceKeys } : {} },
      ...this.crossSigning,
      failures: {},
    });
  }

  private uploadCrossSigning({ body }: DemoRequest): Response {
    const keys = (body ?? {}) as Record<string, unknown>;
    const byUser = (key: string) => (keys[key] ? { [demoUsers.alice]: keys[key] } : {});
    this.crossSigning = {
      master_keys: byUser('master_key'),
      self_signing_keys: byUser('self_signing_key'),
      user_signing_keys: byUser('user_signing_key'),
    };
    return json(200, {});
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
      if (this.pending.length === 0) {
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
      account_data: { events: [{ type: 'm.direct', content: demoDirect }] },
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
    return { next_batch: `s${++this.batch}`, rooms: { join, invite: {}, leave } };
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
    room.timeline.push(event);
    room.readUpTo = eventId;
    this.enqueue({
      kind: 'join',
      roomId,
      body: {
        timeline: { events: [{ ...withDefaults(event), unsigned: { transaction_id: txnId } }], limited: false },
      },
    });
    return json(200, { event_id: eventId });
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
    const profile = demoProfiles[params[0] ?? ''];
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
