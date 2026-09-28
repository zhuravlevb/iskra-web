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
  type DemoRoom,
} from './fixtures';

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
  private readonly invites;
  private readonly initialLimit: number;
  private readonly slowDelayMs: number;
  private readonly filters = new Map<string, unknown>();
  private readonly routes: Array<[string, RegExp, Handler]>;
  private batch = 0;

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
      ['GET', re(`${c}/v1/media/config`), () => json(200, { 'm.upload.size': 50 * 1024 * 1024 })],
      ['GET', re(`${c}/v3/voip/turnServer`), () => json(200, {})],
      ['PUT', re(`${c}/v3/presence/([^/]+)/status`), () => json(200, {})],
      // Звонков (MatrixRTC) в демо нет — и SDK это спрашивает на старте.
      ['GET', re(`${c}/unstable/org.matrix.msc4143/rtc/transports`), () => unrecognized()],
      ['GET', re(`${c}/v1/rtc/transports`), () => unrecognized()],
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
      // Нового ничего нет: держим длинный опрос, как настоящий сервер, но недолго.
      const timeout = Number(url.searchParams.get('timeout') ?? 0);
      await delay(Math.min(timeout, LONG_POLL_CAP_MS), signal);
      return json(200, { next_batch: `s${++this.batch}` });
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
        ephemeral: { events: [] },
        account_data: { events: [] },
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
