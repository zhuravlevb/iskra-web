/**
 * «О чате» — `RoomDetailsStore` нативной Искры на `matrix-js-sdk`.
 *
 * Права читаются из power levels сервера один раз на перемену состояния и *прячут*
 * элементы, а не делают их серыми: серая кнопка — обещание, которое комната не сдержит.
 * Всё, что запрещено, просто не на экране. Пока состояния нет — запрещено всё: иначе
 * кнопка мигнула бы и исчезла.
 *
 * Роль — три слова для человека (администратор, модератор, участник). Вес — число, которое
 * сравнивает сервер: два администратора оба «администраторы», но тронуть друг друга не
 * могут, а создатель комнаты версии 12 выше любого числа (`Infinity`).
 */
import { Direction, EventType, MatrixEvent, RoomEvent, RoomMemberEvent, RoomStateEvent, type MatrixClient, type Room } from 'matrix-js-sdk';
import { alertsRules, roomAlerts, type RoomAlerts } from './pushRules';

export type RoomRole = 'administrator' | 'moderator' | 'member';

export interface MemberSummary {
  id: string;
  /** Никогда не пустое: нет имени — Matrix ID. */
  name: string;
  avatarUrl?: string;
  role: RoomRole;
  /** Вес по правилам комнаты — только для сравнения, на экран не выводится. */
  authority: number;
  /** В комнате есть кто-то ещё с тем же именем — рядом показать Matrix ID. */
  ambiguous: boolean;
  invited: boolean;
}

/** Закреплённое — для списка в панели: кто и что, одной строкой. */
export interface PinnedSummary {
  eventId: string;
  senderName?: string;
  /** Первая строка текста; пусто — не текст или не загрузилось. */
  text: string;
  /** Достать не вышло: удалено или недоступно. */
  unavailable: boolean;
}

export interface RoomPermissions {
  canRename: boolean;
  canChangeTopic: boolean;
  canChangePicture: boolean;
  canChangeVisibility: boolean;
  canInvite: boolean;
  canRemove: boolean;
  canBan: boolean;
  canChangeRoles: boolean;
}

const DENIED: RoomPermissions = {
  canRename: false,
  canChangeTopic: false,
  canChangePicture: false,
  canChangeVisibility: false,
  canInvite: false,
  canRemove: false,
  canBan: false,
  canChangeRoles: false,
};

/** Что не получилось — ключи текстов нативной Искры (`roomAction.*Failed`). */
export type RoomActionFailure = 'rename' | 'topic' | 'picture' | 'visibility' | 'invite' | 'remove' | 'ban' | 'role' | 'leave' | 'alerts';

/** Уровни ролей — как их пишут Element и нативная Искра. */
export const ROLE_LEVEL: Record<RoomRole, number> = { administrator: 100, moderator: 50, member: 0 };

/** Версии комнат, где создатель — вне чисел (MSC4289). */
const CREATOR_IS_UNLIMITED = new Set(['12', 'org.matrix.hydra.11']);

export class RoomDetailsStore {
  name = $state('');
  topic = $state('');
  avatarUrl = $state<string | undefined>(undefined);
  direct = $state(false);
  encrypted = $state(false);
  /** Открытый: войти может любой, кто найдёт. */
  open = $state(false);
  members = $state.raw<MemberSummary[]>([]);
  permissions = $state.raw<RoomPermissions>(DENIED);
  alerts = $state<RoomAlerts>('all');
  /** Закреплённые — последнее закреплённое первым. */
  pinned = $state.raw<PinnedSummary[]>([]);
  /** Мой вес — с ним сравнивается каждое «можно ли тронуть этого человека». */
  ownAuthority = $state(0);
  working = $state(false);
  failure = $state<RoomActionFailure | null>(null);

  private readonly me: string;
  private readonly detach: Array<() => void> = [];
  private membersLoaded = false;
  // Кэш достатого по одному, не состояние: экран видит `pinned`.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly fetched = new Map<string, MatrixEvent | null>();

  constructor(
    private readonly client: MatrixClient,
    readonly roomId: string,
    private readonly isDirect: (roomId: string) => boolean,
  ) {
    this.me = client.getSafeUserId();
    const on = (event: string, handler: (...args: never[]) => void) => {
      const target = client as unknown as { on(e: string, h: (...a: never[]) => void): void; off(e: string, h: (...a: never[]) => void): void };
      target.on(event, handler);
      this.detach.push(() => target.off(event, handler));
    };
    const mine = (e: MatrixEvent) => e.getRoomId() === roomId;
    // Имя комнаты SDK пересчитывает *после* события о состоянии — поэтому и его пересчёт.
    on(RoomStateEvent.Events, (e: MatrixEvent) => mine(e) && this.read());
    on(RoomEvent.Name, (room: Room) => room.roomId === roomId && this.read());
    on(RoomMemberEvent.Name, () => this.read());
    on(RoomMemberEvent.Membership, () => this.read());
    on('accountData', (e: MatrixEvent) => e.getType() === EventType.PushRules && this.readAlerts());
    this.read();
    void this.loadMembers();
  }

  private get room(): Room | null {
    return this.client.getRoom(this.roomId);
  }

  /** Полный список участников — лениво: в первой синхронизации его может не быть. */
  private async loadMembers(): Promise<void> {
    try {
      await this.room?.loadMembersIfNeeded();
    } catch {
      // Не пришёл — покажем тех, кого знаем.
    }
    this.membersLoaded = true;
    this.read();
  }

  read(): void {
    const room = this.room;
    if (!room) return;
    const state = room.getLiveTimeline().getState(Direction.Forward)!;
    this.name = room.name;
    this.topic = (state.getStateEvents(EventType.RoomTopic, '')?.getContent()['topic'] as string | undefined) ?? '';
    this.avatarUrl = room.getMxcAvatarUrl() ?? undefined;
    this.direct = this.isDirect(this.roomId);
    this.encrypted = room.hasEncryptionStateEvent();
    this.open = room.getJoinRule() === 'public';

    const powers = state.getStateEvents(EventType.RoomPowerLevels, '')?.getContent() ?? {};
    const users = (powers['users'] ?? {}) as Record<string, number>;
    const usersDefault = typeof powers['users_default'] === 'number' ? powers['users_default'] : 0;
    const create = state.getStateEvents(EventType.RoomCreate, '');
    // Снимки на одно чтение, не состояние.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const creators = new Set<string>();
    if (create && CREATOR_IS_UNLIMITED.has(String(create.getContent()['room_version'] ?? ''))) {
      const sender = create.getSender();
      if (sender) creators.add(sender);
      for (const extra of (create.getContent()['additional_creators'] as string[] | undefined) ?? []) creators.add(extra);
    }
    const authorityOf = (userId: string) => (creators.has(userId) ? Infinity : typeof users[userId] === 'number' ? users[userId]! : usersDefault);
    const roleOf = (authority: number): RoomRole =>
      authority >= ROLE_LEVEL.administrator ? 'administrator' : authority >= ROLE_LEVEL.moderator ? 'moderator' : 'member';

    const people = room.getMembers().filter((m) => m.membership === 'join' || m.membership === 'invite');
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const names = new Map<string, number>();
    for (const m of people) names.set(m.name, (names.get(m.name) ?? 0) + 1);
    const rank: Record<RoomRole, number> = { administrator: 0, moderator: 1, member: 2 };
    this.members = people
      .map((m): MemberSummary => {
        const authority = authorityOf(m.userId);
        return {
          id: m.userId,
          name: m.name || m.userId,
          ...(m.getMxcAvatarUrl() ? { avatarUrl: m.getMxcAvatarUrl()! } : {}),
          role: roleOf(authority),
          authority,
          ambiguous: (names.get(m.name) ?? 0) > 1 || m.disambiguate,
          invited: m.membership === 'invite',
        };
      })
      // Администраторы, модераторы, остальные; внутри — по имени. Приглашённые — в конце.
      .sort((a, b) => +a.invited - +b.invited || rank[a.role] - rank[b.role] || a.name.localeCompare(b.name));

    this.ownAuthority = authorityOf(this.me);
    const level = (key: string, fallback: number) => (typeof powers[key] === 'number' ? (powers[key] as number) : fallback);
    const may = (type: string) => state.maySendStateEvent(type, this.me);
    this.permissions = {
      canRename: may(EventType.RoomName),
      canChangeTopic: may(EventType.RoomTopic),
      canChangePicture: may(EventType.RoomAvatar),
      canChangeVisibility: may(EventType.RoomJoinRules) && !this.direct,
      canInvite: this.ownAuthority >= level('invite', 0) && room.getMyMembership() === 'join',
      canRemove: this.ownAuthority >= level('kick', 50),
      canBan: this.ownAuthority >= level('ban', 50),
      canChangeRoles: may(EventType.RoomPowerLevels),
    };
    this.readAlerts();
    this.readPinned(room, state.getStateEvents('m.room.pinned_events', '')?.getContent()['pinned']);
  }

  private readPinned(room: Room, raw: unknown): void {
    const ids = (Array.isArray(raw) ? raw : []).filter((id): id is string => typeof id === 'string').reverse();
    this.pinned = ids.map((eventId): PinnedSummary => {
      const event = room.findEventById(eventId) ?? this.fetched.get(eventId) ?? undefined;
      if (event === undefined && !this.fetched.has(eventId)) void this.fetchPinned(eventId);
      if (!event) return { eventId, text: '', unavailable: this.fetched.get(eventId) === null };
      const sender = event.getSender();
      const body = event.isRedacted() ? '' : event.getContent()['body'];
      return {
        eventId,
        ...(sender ? { senderName: room.getMember(sender)?.name || sender } : {}),
        text: typeof body === 'string' ? (body.split('\n')[0] ?? '') : '',
        unavailable: event.isRedacted(),
      };
    });
  }

  private async fetchPinned(eventId: string): Promise<void> {
    this.fetched.set(eventId, null);
    try {
      const event = new MatrixEvent(await this.client.fetchRoomEvent(this.roomId, eventId));
      await this.client.decryptEventIfNeeded(event);
      this.fetched.set(eventId, event);
    } catch {
      // Удалено или не видно этому аккаунту — «недоступно».
    }
    this.read();
  }

  private readAlerts(): void {
    this.alerts = roomAlerts(this.client.pushRules, this.roomId);
  }

  /** Тронуть можно только того, кто ниже тебя, и не себя: уйти — другая кнопка. */
  mayManage(member: MemberSummary): boolean {
    return member.id !== this.me && member.authority < this.ownAuthority;
  }

  mayRemove(member: MemberSummary): boolean {
    return this.permissions.canRemove && this.mayManage(member);
  }

  mayBan(member: MemberSummary): boolean {
    return this.permissions.canBan && this.mayManage(member);
  }

  /** Роли, которые я могу дать: не выше своей. */
  rolesFor(member: MemberSummary): RoomRole[] {
    if (!this.permissions.canChangeRoles || !this.mayManage(member)) return [];
    return (['administrator', 'moderator', 'member'] as const).filter((role) => ROLE_LEVEL[role] <= this.ownAuthority);
  }

  get membersReady(): boolean {
    return this.membersLoaded;
  }

  // ————— Действия —————

  private async act(failure: RoomActionFailure, task: () => Promise<unknown>): Promise<boolean> {
    this.working = true;
    this.failure = null;
    try {
      await task();
      return true;
    } catch {
      this.failure = failure;
      this.read();
      return false;
    } finally {
      this.working = false;
    }
  }

  rename(name: string): Promise<boolean> {
    const value = name.trim();
    if (value === this.name) return Promise.resolve(true);
    return this.act('rename', () => this.client.setRoomName(this.roomId, value));
  }

  setTopic(topic: string): Promise<boolean> {
    const value = topic.trim();
    if (value === this.topic) return Promise.resolve(true);
    return this.act('topic', () => this.client.setRoomTopic(this.roomId, value));
  }

  /** `mxc` — уже загруженная картинка; `null` — убрать. */
  setPicture(mxc: string | null): Promise<boolean> {
    return this.act('picture', () => this.client.sendStateEvent(this.roomId, EventType.RoomAvatar, (mxc ? { url: mxc } : {}) as never, ''));
  }

  setOpen(open: boolean): Promise<boolean> {
    if (open === this.open) return Promise.resolve(true);
    return this.act('visibility', () =>
      this.client.sendStateEvent(this.roomId, EventType.RoomJoinRules, { join_rule: open ? 'public' : 'invite' } as never, ''),
    );
  }

  invite(userId: string): Promise<boolean> {
    const id = userId.trim();
    if (!/^@[^:\s]+:\S+$/.test(id)) {
      this.failure = 'invite';
      return Promise.resolve(false);
    }
    return this.act('invite', () => this.client.invite(this.roomId, id));
  }

  remove(member: MemberSummary): Promise<boolean> {
    if (!this.mayRemove(member)) return Promise.resolve(false);
    return this.act('remove', () => this.client.kick(this.roomId, member.id));
  }

  ban(member: MemberSummary): Promise<boolean> {
    if (!this.mayBan(member)) return Promise.resolve(false);
    return this.act('ban', () => this.client.ban(this.roomId, member.id));
  }

  setRole(member: MemberSummary, role: RoomRole): Promise<boolean> {
    if (!this.rolesFor(member).includes(role)) return Promise.resolve(false);
    return this.act('role', () => this.client.setPowerLevel(this.roomId, member.id, ROLE_LEVEL[role]));
  }

  leave(): Promise<boolean> {
    return this.act('leave', () => this.client.leave(this.roomId));
  }

  setAlerts(alerts: RoomAlerts): Promise<boolean> {
    const previous = this.alerts;
    this.alerts = alerts;
    return this.act('alerts', async () => {
      const { remove, add } = alertsRules(alerts, this.roomId);
      const rules = this.client.pushRules?.global;
      for (const rule of remove) {
        const exists = rules?.[rule.kind]?.some((r) => r.rule_id === rule.ruleId);
        if (exists) await this.client.deletePushRule('global', rule.kind as never, rule.ruleId);
      }
      if (add) await this.client.addPushRule('global', add.kind as never, add.ruleId, add.body as never);
    }).then((ok) => {
      if (!ok) this.alerts = previous;
      return ok;
    });
  }

  dismissFailure(): void {
    this.failure = null;
  }

  destroy(): void {
    for (const off of this.detach.splice(0)) off();
  }
}
