/**
 * `TimelineStore` — лента одной комнаты.
 *
 * **Живая лента начинается пустой, а историю надо попросить.** В нативной Искре это
 * ломалось: история приходила побочным эффектом отрисовки спиннера, и удаление спиннера
 * опустошило все чаты. Здесь история просится явно — `fill(needsMore)` в цикле, пока экран
 * говорит «мало», — а прокрутка просит *следующие* страницы (`loadMore`); первую она
 * попросить не может. Условие цикла — высота содержимого против высоты окна, и его знает
 * экран, а не ядро: ядро не знает, телефон это или монитор в 1440 пикселей.
 *
 * И уроки оттуда же:
 * - Одна страница в полёте, и никогда две. Кто пришёл за страницей, пока летит чужая, ждёт
 *   её, а не уходит ни с чем, — и цикл считает «дождался» отдельно от «принёс».
 * - Неудачная страница — не страница: цикл, съевший бюджет на ошибках, не должен
 *   отдать пустой чат как «загрузили».
 * - Поколение: ответ, пришедший после сброса ленты, не пишет в новую ленту.
 */
import {
  Direction,
  EventStatus,
  EventType,
  MatrixEventEvent,
  RelationType,
  RoomEvent,
  RoomMemberEvent,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from 'matrix-js-sdk';
import { mapEvent, type MapperContext } from './mapper';
import { layout, type TimelineItem } from './layout';
import type { Message, Reaction } from './message';

const PAGE_SIZE = 30;
/** Сколько страниц за один `fill`. Больше — это уже не «наполнить экран». */
const MAX_PAGES = 20;
const PAGE_TIMEOUT_MS = 20_000;

type PageOutcome = 'fetched' | 'waited' | 'failed' | 'start';

export class TimelineStore {
  items = $state.raw<TimelineItem[]>([]);
  messages = $state.raw<Message[]>([]);
  /** Дошли до начала комнаты — больше просить нечего. */
  atStart = $state(false);
  /** Идёт страница, которую попросил сам человек прокруткой, — для спиннера наверху. */
  loadingMore = $state(false);
  /** Первая страница не пришла вовсе — «Не удалось открыть чат», а не пустой чат. */
  loadFailed = $state(false);

  readonly roomId: string;
  private readonly client: MatrixClient;
  private readonly ownUserId: string;
  private generation = 0;
  private pageInFlight: Promise<PageOutcome> | null = null;
  private scheduled = false;
  private destroyed = false;
  private readonly detach: Array<() => void> = [];
  /** Ключ строки держится за объект события: local echo получает настоящий ID, строка — нет. */
  private readonly keys = new WeakMap<MatrixEvent, string>();
  private nextKey = 0;

  constructor(client: MatrixClient, roomId: string) {
    this.client = client;
    this.roomId = roomId;
    this.ownUserId = client.getSafeUserId();
    this.listen();
    this.rebuild();
  }

  private get room(): Room | null {
    return this.client.getRoom(this.roomId);
  }

  private listen(): void {
    const on = (event: string, handler: (...args: never[]) => void) => {
      const target = this.client as unknown as {
        on(e: string, h: (...args: never[]) => void): void;
        off(e: string, h: (...args: never[]) => void): void;
      };
      target.on(event, handler);
      this.detach.push(() => target.off(event, handler));
    };
    const mine = (room: Room | undefined | null) => room?.roomId === this.roomId;
    on(RoomEvent.Timeline, (_e: MatrixEvent, room: Room | undefined) => mine(room) && this.schedule());
    on(RoomEvent.LocalEchoUpdated, (_e: MatrixEvent, room: Room) => mine(room) && this.schedule());
    on(RoomEvent.Redaction, (_e: MatrixEvent, room: Room) => mine(room) && this.schedule());
    on(RoomEvent.TimelineReset, (room: Room | undefined) => {
      if (!mine(room)) return;
      // Сервер прислал «слишком много пропущено» — живая лента начата заново. Старые
      // страницы к ней не относятся; всё, что летит, — в прошлое поколение.
      this.generation++;
      this.pageInFlight = null;
      this.atStart = false;
      this.schedule();
    });
    on(MatrixEventEvent.Decrypted, (event: MatrixEvent) => event.getRoomId() === this.roomId && this.schedule());
    on(MatrixEventEvent.Replaced, (event: MatrixEvent) => event.getRoomId() === this.roomId && this.schedule());
    on(RoomMemberEvent.Name, (_e: MatrixEvent, member: { roomId: string }) => member.roomId === this.roomId && this.schedule());
  }

  private schedule(): void {
    if (this.scheduled || this.destroyed) return;
    this.scheduled = true;
    const run = () => {
      this.scheduled = false;
      if (!this.destroyed) this.rebuild();
    };
    if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  /** Пересобирает ленту сейчас. Тестам — чтобы не ждать кадра. */
  rebuild(): void {
    const room = this.room;
    if (!room) {
      this.messages = [];
      this.items = [];
      return;
    }
    const context = this.context(room);
    const messages: Message[] = [];
    for (const event of room.getLiveTimeline().getEvents()) {
      const message = mapEvent(event, context);
      if (message) messages.push(message);
    }
    // Не ушедшие — SDK держит их отдельно от ленты (`pendingEventOrdering: detached`, так
    // создаёт клиент `UserSession`), и они стоят в конце, пока не уйдут или их не уберут.
    for (const event of pendingOf(room)) {
      if (messages.some((m) => m.key === this.keys.get(event))) continue;
      const message = mapEvent(event, context);
      if (message) messages.push(message);
    }
    this.messages = messages;
    this.items = layout(messages);
    if (this.atStart === false && room.getLiveTimeline().getPaginationToken(Direction.Backward) === null) {
      this.atStart = true;
    }
  }

  private context(room: Room): MapperContext {
    return {
      ownUserId: this.ownUserId,
      nameOf: (userId) => room.getMember(userId)?.rawDisplayName?.trim() || userId,
      avatarOf: (userId) => room.getMember(userId)?.getMxcAvatarUrl() ?? undefined,
      eventById: (eventId) => room.findEventById(eventId),
      reactionsOf: (eventId) => this.reactionsOf(room, eventId),
      keyOf: (event) => {
        let key = this.keys.get(event);
        if (!key) {
          key = event.getTxnId() ? `txn-${event.getTxnId()}` : (event.getId() ?? `local-${this.nextKey++}`);
          this.keys.set(event, key);
        }
        return key;
      },
    };
  }

  private reactionsOf(room: Room, eventId: string): Reaction[] {
    const relations = room.relations.getChildEventsForEvent(eventId, RelationType.Annotation, EventType.Reaction);
    const sorted = relations?.getSortedAnnotationsByKey() ?? [];
    return sorted
      .map(([key, events]) => {
        const live = [...events].filter((e) => !e.isRedacted() && e.status !== EventStatus.CANCELLED);
        return { key, count: live.length, mine: live.some((e) => e.getSender() === this.ownUserId) };
      })
      .filter((r) => r.count > 0);
  }

  /**
   * Наполнить экран: страница за страницей, пока `needsMore()` говорит «мало». Открытие
   * чата и «окно стало выше» (развернули на весь экран) — один и тот же вызов.
   */
  async fill(needsMore: () => boolean): Promise<void> {
    let fetched = 0;
    let waited = 0;
    while (!this.destroyed && !this.atStart && needsMore() && fetched < MAX_PAGES && waited < MAX_PAGES) {
      const outcome = await this.page(false);
      if (outcome === 'fetched') fetched++;
      else if (outcome === 'waited') waited++;
      else if (outcome === 'start') break;
      else {
        // Страница не пришла. Пустой чат после этого — не «пусто», а «не открылся».
        if (this.messages.length === 0) this.loadFailed = true;
        break;
      }
      // Дать экрану разложить новое, прежде чем спрашивать «мало ли ещё».
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /** Следующая страница — прокрутка дошла до верха. */
  async loadMore(): Promise<void> {
    await this.page(true);
  }

  /** «Попробовать снова» после неудачного открытия. */
  async retryOpen(needsMore: () => boolean): Promise<void> {
    this.loadFailed = false;
    await this.fill(needsMore);
  }

  private async page(byUser: boolean): Promise<PageOutcome> {
    if (this.pageInFlight) {
      await this.pageInFlight;
      return 'waited';
    }
    const room = this.room;
    if (!room) return 'failed';
    if (this.atStart) return 'start';

    const generation = this.generation;
    if (byUser) this.loadingMore = true;
    const task = (async (): Promise<PageOutcome> => {
      try {
        const more = await withTimeout(
          this.client.paginateEventTimeline(room.getLiveTimeline(), { backwards: true, limit: PAGE_SIZE }),
          PAGE_TIMEOUT_MS,
        );
        if (generation !== this.generation) return 'waited';
        if (!more) this.atStart = true;
        this.rebuild();
        return more ? 'fetched' : 'start';
      } catch {
        return 'failed';
      }
    })();
    this.pageInFlight = task;
    try {
      return await task;
    } finally {
      if (this.pageInFlight === task) this.pageInFlight = null;
      if (byUser) this.loadingMore = false;
    }
  }

  // ————— Отправка —————

  /** Текст уходит; local echo появляется в ленте сразу, статус — в `delivery`. */
  send(text: string): void {
    const body = text.trim();
    if (!body) return;
    // Промис не ждём: неудача видна в самом сообщении («Не отправлено»), а не исключением.
    this.client.sendTextMessage(this.roomId, body).catch(() => this.schedule());
    this.schedule();
  }

  private pendingByKey(key: string): MatrixEvent | undefined {
    const room = this.room;
    if (!room) return undefined;
    return [...room.getLiveTimeline().getEvents(), ...pendingOf(room)].find((e) => this.keys.get(e) === key);
  }

  /** «Отправить заново». */
  retry(key: string): void {
    const event = this.pendingByKey(key);
    const room = this.room;
    if (!event || !room || event.status !== EventStatus.NOT_SENT) return;
    this.client.resendEvent(event, room).catch(() => this.schedule());
    this.schedule();
  }

  /** «Удалить» не ушедшее — оно и не уходило, удалять нечего, кроме строки. */
  discard(key: string): void {
    const event = this.pendingByKey(key);
    if (!event || event.status !== EventStatus.NOT_SENT) return;
    this.client.cancelPendingEvent(event);
    this.schedule();
  }

  // ————— Прочитано —————

  private lastReceiptFor?: string;

  /** Отметить прочитанным последнее чужое — зовёт экран, когда чат виден и внизу. */
  markRead(): void {
    const room = this.room;
    if (!room) return;
    const events = room.getLiveTimeline().getEvents();
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]!;
      const id = event.getId();
      if (!id || id.startsWith('~') || event.status) continue;
      if (room.hasUserReadEvent(this.ownUserId, id) || this.lastReceiptFor === id) return;
      this.lastReceiptFor = id;
      this.client.sendReadReceipt(event).catch(() => {
        this.lastReceiptFor = undefined;
      });
      return;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.generation++;
    for (const off of this.detach.splice(0)) off();
  }
}

function pendingOf(room: Room): MatrixEvent[] {
  try {
    return room.getPendingEvents();
  } catch {
    // `chronological`: не ушедшие уже лежат в ленте.
    return [];
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
