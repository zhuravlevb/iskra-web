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
  MatrixEvent,
  MatrixEventEvent,
  RelationType,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  type MatrixClient,
  type Room,
} from 'matrix-js-sdk';
import { sendAttachment, uploadClientFor, type OutgoingFile, type UploadClient } from '../media/upload';
import { mapEvent, type MapperContext } from './mapper';
import { layout, type TimelineItem } from './layout';
import type { Message, Reaction } from './message';

/**
 * Вложение в пути: загружается или не загрузилось. В ленте стоит своим пузырём с
 * прогрессом, пока событие не отправлено; дальше его место занимает обычное эхо SDK.
 */
export interface Upload {
  id: string;
  file: OutgoingFile;
  caption?: string;
  replyTo?: { eventId: string; senderId: string; own: boolean };
  /** 0…1 */
  progress: number;
  state: 'uploading' | 'failed';
}

/** Что не получилось — ключи текстов нативной Искры (`timeline.*Failed`). */
export type TimelineFailure = 'reactionFailed' | 'deleteFailed' | 'editFailed' | 'pinFailed' | 'voteFailed';

const PINNED_EVENTS = 'm.room.pinned_events';
/** Как долго «печатает» держится без нового нажатия — и как часто его повторять. */
const TYPING_TIMEOUT_MS = 30_000;
const TYPING_REPEAT_MS = 20_000;
/** Сколько страниц истории листать в поисках закреплённого, прежде чем сдаться. */
const JUMP_MAX_PAGES = 10;

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
  /** Кто сейчас печатает — имена, без меня. */
  typing = $state.raw<string[]>([]);
  /** Закреплённые — по порядку закрепления, последнее — в конце. */
  pinnedIds = $state.raw<string[]>([]);
  /** Последнее закреплённое — для полосы над лентой. Не загружено — достаём отдельно. */
  pinnedMessage = $state.raw<Message | undefined>(undefined);
  canPin = $state(false);
  /** Вложения в пути — по порядку отправки. */
  uploads = $state.raw<Upload[]>([]);
  /** Последнее действие не удалось — сказать и дать повторить. */
  failure = $state<TimelineFailure | null>(null);

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
  /** Закреплённые, которых нет в загруженной ленте, — достаются по одному и помнятся. */
  // Кэш, а не состояние: экран видит его через `pinnedMessage`.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly fetched = new Map<string, Message | null>();
  private typingSentAt = 0;
  private readonly uploader: UploadClient;
  // Служебное, не состояние: экран видит `uploads`.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly aborts = new Map<string, AbortController>();
  /** Вложения уходят по одному: порядок в ленте — порядок, в котором их выбрали. */
  private uploadQueue: Promise<void> = Promise.resolve();
  private nextUpload = 0;

  constructor(client: MatrixClient, roomId: string, uploader?: UploadClient) {
    this.client = client;
    this.roomId = roomId;
    this.uploader = uploader ?? uploadClientFor(client);
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
    on(RoomMemberEvent.Typing, (_e: MatrixEvent, member: { roomId: string }) => member.roomId === this.roomId && this.readTyping());
    on(RoomStateEvent.Events, (event: MatrixEvent) => event.getRoomId() === this.roomId && this.schedule());
  }

  private readTyping(): void {
    const room = this.room;
    this.typing = room
      ? room
          .getMembers()
          .filter((m) => m.typing && m.userId !== this.ownUserId)
          .map((m) => m.rawDisplayName?.trim() || m.userId)
      : [];
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
    this.readPinned(room);
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
    this.readPinnedMessage(room, context);
    if (this.atStart === false && room.getLiveTimeline().getPaginationToken(Direction.Backward) === null) {
      this.atStart = true;
    }
  }

  private readPinned(room: Room): void {
    const state = room.getLiveTimeline().getState(Direction.Forward);
    const pinned = state?.getStateEvents(PINNED_EVENTS, '')?.getContent()['pinned'];
    const ids = Array.isArray(pinned) ? pinned.filter((id): id is string => typeof id === 'string') : [];
    if (ids.join() !== this.pinnedIds.join()) this.pinnedIds = ids;
    this.canPin = !!state?.maySendStateEvent(PINNED_EVENTS, this.ownUserId);
  }

  private readPinnedMessage(room: Room, context: MapperContext): void {
    const last = this.pinnedIds.at(-1);
    if (!last) {
      this.pinnedMessage = undefined;
      return;
    }
    const loaded = this.messages.find((m) => m.eventId === last);
    if (loaded) {
      this.pinnedMessage = loaded;
      return;
    }
    const known = this.fetched.get(last);
    if (known !== undefined) {
      this.pinnedMessage = known ?? undefined;
      return;
    }
    // Закрепляют то, что важно, а важное закрепляют рано: закреплённого часто нет среди
    // загруженного. Достаём одно событие, а не листаем историю.
    this.fetched.set(last, null);
    void this.fetchEvent(room, last).then((event) => {
      const message = event ? mapEvent(event, context) : undefined;
      this.fetched.set(last, message ?? null);
      if (message) this.schedule();
    });
  }

  private async fetchEvent(room: Room, eventId: string): Promise<MatrixEvent | undefined> {
    try {
      const raw = await this.client.fetchRoomEvent(room.roomId, eventId);
      const event = new MatrixEvent(raw);
      await this.client.decryptEventIfNeeded(event);
      return event;
    } catch {
      return undefined;
    }
  }

  private context(room: Room): MapperContext {
    const state = room.getLiveTimeline().getState(Direction.Forward);
    // Снимок на одну пересборку, не состояние.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const pinned = new Set(this.pinnedIds);
    return {
      ownUserId: this.ownUserId,
      nameOf: (userId) => room.getMember(userId)?.rawDisplayName?.trim() || userId,
      avatarOf: (userId) => room.getMember(userId)?.getMxcAvatarUrl() ?? undefined,
      eventById: (eventId) => room.findEventById(eventId),
      reactionsOf: (eventId) => this.reactionsOf(room, eventId),
      relationsOf: (eventId, relType, eventTypes) =>
        eventTypes.flatMap((type) => room.relations.getChildEventsForEvent(eventId, relType, type)?.getRelations() ?? []),
      isPinned: (eventId) => pinned.has(eventId),
      canRedactOthers: (event) => !!state?.maySendRedactionForEvent(event, this.ownUserId),
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

  /**
   * Текст уходит; local echo появляется в ленте сразу, статус — в `delivery`. С `replyTo` —
   * ответ: связь `m.in_reply_to` и упоминание автора, без цитаты-подпорки в теле (её
   * отменила спецификация, а цитату рисует получатель).
   */
  send(text: string, replyTo?: Message): void {
    const body = text.trim();
    if (!body) return;
    this.typingStopped();
    const content: Record<string, unknown> = { msgtype: 'm.text', body };
    if (replyTo?.eventId) {
      content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyTo.eventId } };
      content['m.mentions'] = replyTo.own ? {} : { user_ids: [replyTo.senderId] };
    }
    // Промис не ждём: неудача видна в самом сообщении («Не отправлено»), а не исключением.
    this.client.sendMessage(this.roomId, content as never).catch(() => this.schedule());
    this.schedule();
  }

  // ————— Вложения —————

  /**
   * Файлы уходят по одному, подпись — с первым, ответ — тоже с первым. Путь наверх один —
   * `sendAttachment`, и он сам решает, шифровать ли (см. `core/media/upload.ts`).
   */
  sendFiles(files: OutgoingFile[], caption?: string, replyTo?: Message): void {
    this.typingStopped();
    const reply = replyTo?.eventId ? { eventId: replyTo.eventId, senderId: replyTo.senderId, own: replyTo.own } : undefined;
    files.forEach((file, index) => {
      const upload: Upload = {
        id: `upload-${this.nextUpload++}`,
        file,
        progress: 0,
        state: 'uploading',
        ...(index === 0 && caption?.trim() ? { caption: caption.trim() } : {}),
        ...(index === 0 && reply ? { replyTo: reply } : {}),
      };
      this.uploads = [...this.uploads, upload];
      this.enqueue(upload.id);
    });
  }

  retryUpload(id: string): void {
    this.patchUpload(id, { state: 'uploading', progress: 0 });
    this.enqueue(id);
  }

  /** Отменить: идущая загрузка обрывается, не ушедшее — просто убирается. */
  cancelUpload(id: string): void {
    this.aborts.get(id)?.abort();
    this.aborts.delete(id);
    this.uploads = this.uploads.filter((u) => u.id !== id);
  }

  private enqueue(id: string): void {
    this.uploadQueue = this.uploadQueue.then(() => this.runUpload(id));
  }

  private async runUpload(id: string): Promise<void> {
    const upload = this.uploads.find((u) => u.id === id);
    // Ушли из чата — загрузка всё равно доезжает: текст при уходе тоже уходит.
    if (!upload) return;
    const abort = new AbortController();
    this.aborts.set(id, abort);
    try {
      await sendAttachment(this.uploader, this.roomId, upload.file, {
        ...(upload.caption ? { caption: upload.caption } : {}),
        ...(upload.replyTo ? { replyTo: upload.replyTo } : {}),
        signal: abort.signal,
        onProgress: (progress) => this.patchUpload(id, { progress }),
      });
      // Ушло — дальше это обычное событие ленты (эхо SDK), а не строка загрузки.
      this.uploads = this.uploads.filter((u) => u.id !== id);
    } catch {
      if (!abort.signal.aborted) this.patchUpload(id, { state: 'failed' });
    } finally {
      this.aborts.delete(id);
      this.schedule();
    }
  }

  private patchUpload(id: string, patch: Partial<Upload>): void {
    this.uploads = this.uploads.map((u) => (u.id === id ? { ...u, ...patch } : u));
  }

  /** Правка своего: новое тело в `m.new_content`, старое — со звёздочкой для старых клиентов. */
  edit(message: Message, text: string): void {
    const body = text.trim();
    if (!body || !message.canEdit || !message.eventId) return;
    const kind = message.kind;
    if (kind.type !== 'text' && kind.type !== 'emote' && kind.type !== 'notice') return;
    this.typingStopped();
    if (body === kind.body) return;
    const msgtype = kind.type === 'emote' ? 'm.emote' : kind.type === 'notice' ? 'm.notice' : 'm.text';
    const content = {
      msgtype,
      body: `* ${body}`,
      'm.new_content': { msgtype, body },
      'm.relates_to': { rel_type: 'm.replace', event_id: message.eventId },
    };
    this.act('editFailed', () => this.client.sendMessage(this.roomId, content as never));
  }

  /** Реакция: своя такая уже стоит — снять, нет — поставить. */
  react(message: Message, key: string): void {
    const room = this.room;
    if (!room || !message.eventId) return;
    const mine = room.relations
      .getChildEventsForEvent(message.eventId, RelationType.Annotation, EventType.Reaction)
      ?.getRelations()
      .find((e) => e.getSender() === this.ownUserId && e.getRelation()?.key === key && !e.isRedacted() && e.status !== EventStatus.CANCELLED);
    if (mine) {
      const id = mine.getId();
      if (mine.status && mine.status !== EventStatus.SENT) {
        // Ещё не ушла — её и отменяем, удалять на сервере нечего.
        this.client.cancelPendingEvent(mine);
        this.schedule();
      } else if (id) {
        this.act('reactionFailed', () => this.client.redactEvent(this.roomId, id));
      }
      return;
    }
    const content = { 'm.relates_to': { rel_type: RelationType.Annotation, event_id: message.eventId, key } };
    this.act('reactionFailed', () => this.client.sendEvent(this.roomId, EventType.Reaction, content as never));
  }

  /** Удалить — у всех. Спрашивает экран; здесь — уже решено. */
  remove(message: Message): void {
    if (!message.canDelete || !message.eventId) return;
    const id = message.eventId;
    this.act('deleteFailed', () => this.client.redactEvent(this.roomId, id));
  }

  pin(message: Message): void {
    this.setPinned(message, true);
  }

  unpin(message: Message): void {
    this.setPinned(message, false);
  }

  private setPinned(message: Message, pinned: boolean): void {
    const id = message.eventId;
    if (!id || !this.canPin) return;
    const rest = this.pinnedIds.filter((p) => p !== id);
    const next = pinned ? [...rest, id] : rest;
    this.act('pinFailed', () => this.client.sendStateEvent(this.roomId, PINNED_EVENTS as never, { pinned: next } as never, ''));
  }

  /** Голос в опросе. Пустой выбор — отозвать голос. */
  vote(message: Message, answerIds: string[]): void {
    if (message.kind.type !== 'poll' || !message.eventId || message.kind.poll.ended) return;
    const { stable, maxSelections } = message.kind.poll;
    const selections = answerIds.slice(0, maxSelections);
    const relation = { 'm.relates_to': { rel_type: 'm.reference', event_id: message.eventId } };
    const [type, content] = stable
      ? ['m.poll.response', { ...relation, 'm.selections': selections }]
      : ['org.matrix.msc3381.poll.response', { ...relation, 'org.matrix.msc3381.poll.response': { answers: selections } }];
    this.act('voteFailed', () => this.client.sendEvent(this.roomId, type as never, content as never));
  }

  private act(failure: TimelineFailure, task: () => Promise<unknown>): void {
    this.failure = null;
    task().then(
      () => this.schedule(),
      () => {
        this.failure = failure;
        this.schedule();
      },
    );
    this.schedule();
  }

  dismissFailure(): void {
    this.failure = null;
  }

  /** `↑` в пустом композере — последнее своё, которое можно править. */
  lastEditable(): Message | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i]!;
      if (message.canEdit) return message;
    }
    return undefined;
  }

  // ————— «Печатает…» —————

  /** Человек набирает текст. Повторяем не чаще раза в 20 секунд: сервер держит 30. */
  typingActive(): void {
    const now = Date.now();
    if (now - this.typingSentAt < TYPING_REPEAT_MS) return;
    this.typingSentAt = now;
    this.client.sendTyping(this.roomId, true, TYPING_TIMEOUT_MS).catch(() => {});
  }

  /** Стёр всё, отправил, ушёл из чата — перестал печатать. */
  typingStopped(): void {
    if (!this.typingSentAt) return;
    this.typingSentAt = 0;
    this.client.sendTyping(this.roomId, false, 0).catch(() => {});
  }

  // ————— Переход к сообщению —————

  /**
   * Довести ленту до события — для полосы закреплённого. Листает назад, но не бесконечно:
   * закреплённое два года назад не стоит двадцати запросов. `false` — не нашли.
   */
  async reveal(eventId: string): Promise<boolean> {
    for (let pages = 0; pages <= JUMP_MAX_PAGES; pages++) {
      if (this.messages.some((m) => m.eventId === eventId)) return true;
      if (this.destroyed || this.atStart) return false;
      const outcome = await this.page(true);
      if (outcome === 'failed' || outcome === 'start') return this.messages.some((m) => m.eventId === eventId);
    }
    return false;
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
    this.typingStopped();
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
