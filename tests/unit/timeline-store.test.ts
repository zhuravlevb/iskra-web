import { afterEach, describe, expect, it } from 'vitest';
import { ClientEvent, createClient, PendingEventOrdering, SyncState, type MatrixClient } from 'matrix-js-sdk';
import { DemoHomeserver, DEMO_SEND_FAILS_ONCE, DEMO_TYPING_MS, type DemoServerOptions } from '../../src/core/demo/server';
import { demoRooms, demoUsers } from '../../src/core/demo/fixtures';
import { TimelineStore } from '../../src/core/timeline/timelineStore.svelte.ts';
import { quietLogger } from '../../src/core/support/logger';

let client: MatrixClient | undefined;
let store: TimelineStore | undefined;

afterEach(async () => {
  store?.destroy();
  // Rust-крипто после синхронизации проверяет резервную копию в фоне. Остановить клиент
  // посреди проверки — освободить olm-машину у неё из-под рук («null pointer passed to
  // rust»). Идущая проверка одна, и этот вызов возвращает её же — дождаться и остановить.
  await client?.getCrypto()?.checkKeyBackupAndEnable().catch(() => {});
  client?.stopClient();
  client = store = undefined;
});

async function started(options?: DemoServerOptions): Promise<{ client: MatrixClient; server: DemoHomeserver }> {
  const server = new DemoHomeserver(options);
  client = createClient({
    baseUrl: server.baseUrl,
    fetchFn: server.fetch,
    logger: quietLogger(),
    userId: demoUsers.alice,
    deviceId: 'DEMODEVICE',
    accessToken: 'demo-token-DEMODEVICE',
  });
  const prepared = new Promise<void>((resolve) => client!.on(ClientEvent.Sync, (s) => s === SyncState.Prepared && resolve()));
  await client.startClient({ initialSyncLimit: 20, pendingEventOrdering: PendingEventOrdering.Detached });
  await prepared;
  return { client, server };
}

async function until(condition: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
    store?.rebuild();
  }
}

const texts = (s: TimelineStore) => s.messages.filter((m) => m.kind.type === 'text').map((m) => (m.kind as { body: string }).body);

describe('TimelineStore на демо-сервере', () => {
  it('история просится явно и в цикле — пока экран говорит «мало»', async () => {
    const { client } = await started();
    store = new TimelineStore(client, demoRooms.history);
    const before = texts(store).length;
    expect(before).toBe(20);
    // «Экран» хочет 100 сообщений.
    await store.fill(() => texts(store!).length < 100);
    expect(texts(store).length).toBeGreaterThanOrEqual(100);
    expect(store.atStart).toBe(false);
    // А монитор высотой в 400 сообщений — дочитывает до начала комнаты.
    await store.fill(() => true);
    expect(texts(store).length).toBe(400);
    expect(texts(store)[0]).toBe('Сообщение номер 1');
    expect(store.atStart).toBe(true);
  });

  it('две страницы одновременно не летят: второй просящий ждёт первую', async () => {
    const { client, server } = await started();
    store = new TimelineStore(client, demoRooms.history);
    let requests = 0;
    const original = server.fetch;
    const counting: typeof fetch = (input, init) => {
      if (String(input instanceof Request ? input.url : input).includes('/messages')) requests++;
      return original(input, init);
    };
    (client as unknown as { http: { opts: { fetchFn: typeof fetch } } }).http.opts.fetchFn = counting;
    await Promise.all([store.loadMore(), store.loadMore(), store.loadMore()]);
    expect(requests).toBe(1);
  });

  it('отправка: local echo сразу, потом — отправлено, с тем же ключом строки', async () => {
    const { client, server } = await started();
    store = new TimelineStore(client, demoRooms.weekend);
    store.send('Беру мангал');
    store.rebuild();
    const echo = store.messages.at(-1)!;
    expect(echo).toMatchObject({ own: true, kind: { type: 'text', body: 'Беру мангал' } });
    expect(echo.delivery.state).toBe('sending');
    await until(() => store!.messages.at(-1)!.delivery.state === 'sent' && !!store!.messages.at(-1)!.eventId);
    expect(store.messages.at(-1)!.key).toBe(echo.key);
    expect(store.messages.filter((m) => m.kind.type === 'text' && m.kind.body === 'Беру мангал')).toHaveLength(1);
    expect(server.unknown).toEqual([]);
  });

  it('не ушло — «не отправлено», «отправить заново» — ушло', async () => {
    const { client } = await started();
    store = new TimelineStore(client, demoRooms.weekend);
    store.send(DEMO_SEND_FAILS_ONCE);
    await until(() => store!.messages.at(-1)!.delivery.state === 'failed');
    const failed = store.messages.at(-1)!;
    expect(failed.delivery).toEqual({ state: 'failed', reason: 'server' });
    store.retry(failed.key);
    await until(() => store!.messages.at(-1)!.delivery.state === 'sent' && !!store!.messages.at(-1)!.eventId);
  });

  it('не ушедшее можно убрать', async () => {
    const { client } = await started();
    store = new TimelineStore(client, demoRooms.quiet);
    store.send(DEMO_SEND_FAILS_ONCE);
    await until(() => store!.messages.at(-1)!.delivery.state === 'failed');
    store.discard(store.messages.at(-1)!.key);
    await until(() => !texts(store!).includes(DEMO_SEND_FAILS_ONCE));
  });

  it('в зашифрованную комнату — через Rust-крипто', async () => {
    const { client, server } = await started();
    await client.initRustCrypto({ useIndexedDB: false });
    store = new TimelineStore(client, demoRooms.anya);
    store.send('Возьму');
    await until(() => store!.messages.at(-1)!.delivery.state === 'sent' && !!store!.messages.at(-1)!.eventId, 15_000);
    expect(server.unknown).toEqual([]);
  }, 20_000);

  it('прочитано — отметка уходит, значок гаснет', async () => {
    const { client } = await started();
    store = new TimelineStore(client, demoRooms.weekend);
    const room = client.getRoom(demoRooms.weekend)!;
    store.markRead();
    await until(() => room.getUnreadNotificationCount() === 0);
  });

  it('реакции и правки — на месте', async () => {
    const { client } = await started();
    store = new TimelineStore(client, demoRooms.anya);
    const lake = store.messages.find((m) => m.kind.type === 'text' && m.kind.body.startsWith('Хотим за город'))!;
    expect(lake.reactions).toEqual([{ key: '🔥', count: 1, mine: true }]);
    const edited = store.messages.find((m) => m.kind.type === 'text' && m.kind.body === 'В десять у метро')!;
    expect(edited.edited).toBe(true);
    const reply = store.messages.find((m) => m.replyTo)!;
    expect(reply.replyTo).toMatchObject({ senderName: 'Аня', text: 'Хотим за город, на озеро. Поедешь?' });
  });

  const find = (s: TimelineStore, body: string) => s.messages.find((m) => 'body' in m.kind && m.kind.body === body);

  it('ответ: связь с оригиналом и упоминание автора; цитата — у ответа', async () => {
    const { client } = await started();
    store = new TimelineStore(client, demoRooms.weekend);
    const question = find(store, 'Кто что берёт на пикник?')!;
    store.send('Я — мангал', question);
    await until(() => !!find(store!, 'Я — мангал')?.eventId);
    const reply = find(store, 'Я — мангал')!;
    expect(reply.replyTo).toMatchObject({ eventId: question.eventId, senderName: 'Борис', text: 'Кто что берёт на пикник?' });
    const event = client.getRoom(demoRooms.weekend)!.findEventById(reply.eventId!)!;
    expect(event.getContent()['m.mentions']).toEqual({ user_ids: [question.senderId] });
  });

  it('правка: текст меняется, пометка «изменено», строка та же; ↑ находит последнее своё', async () => {
    const { client } = await started();
    store = new TimelineStore(client, demoRooms.weekend);
    store.send('Буду в 10');
    await until(() => find(store!, 'Буду в 10')?.canEdit === true);
    const mine = find(store, 'Буду в 10')!;
    expect(store.lastEditable()?.key).toBe(mine.key);
    store.edit(mine, 'Буду в 11');
    await until(() => !!find(store!, 'Буду в 11')?.edited);
    expect(find(store, 'Буду в 11')!.key).toBe(mine.key);
    expect(find(store, 'Буду в 10')).toBeUndefined();
    // Чужое не правится.
    store.edit(find(store, 'Я — пирог')!, 'взлом');
    expect(find(store, 'взлом')).toBeUndefined();
  });

  it('реакция: поставить, снять повторным нажатием', async () => {
    const { client, server } = await started();
    store = new TimelineStore(client, demoRooms.weekend);
    const pie = () => find(store!, 'Я — пирог')!;
    store.react(pie(), '❤️');
    await until(() => pie().reactions.some((r) => r.key === '❤️' && r.mine));
    // Дождаться, пока реакция уйдёт: снимают уже её, а не local echo.
    await until(() => {
      const room = client.getRoom(demoRooms.weekend)!;
      const reaction = room.relations.getChildEventsForEvent(pie().eventId!, 'm.annotation', 'm.reaction')?.getRelations()[0];
      return !!reaction && !reaction.status;
    });
    store.react(pie(), '❤️');
    await until(() => pie().reactions.length === 0);
    expect(server.unknown).toEqual([]);
  });

  it('удаление своего — «сообщение удалено»; чужое без прав — нельзя', async () => {
    const { client } = await started();
    store = new TimelineStore(client, demoRooms.weekend);
    expect(find(store, 'Я — пирог')!.canDelete).toBe(false);
    store.send('Ошибся чатом');
    await until(() => find(store!, 'Ошибся чатом')?.canDelete === true);
    const key = find(store, 'Ошибся чатом')!.key;
    store.remove(find(store, 'Ошибся чатом')!);
    await until(() => store!.messages.find((m) => m.key === key)?.kind.type === 'deleted');
    expect(store.failure).toBeNull();
  });

  it('закреп: видно чужое закреплённое; своё — закрепить и открепить, где есть права', async () => {
    const { client } = await started();
    store = new TimelineStore(client, demoRooms.weekend);
    expect(store.canPin).toBe(false);
    expect(store.pinnedMessage).toMatchObject({ kind: { body: 'Кто что берёт на пикник?' }, pinned: true });
    store.destroy();

    store = new TimelineStore(client, demoRooms.history);
    expect(store.canPin).toBe(true);
    const last = store.messages.at(-1)!;
    store.pin(last);
    await until(() => store!.pinnedMessage?.key === last.key && store!.messages.at(-1)!.pinned);
    store.unpin(store.messages.at(-1)!);
    await until(() => store!.pinnedIds.length === 0 && !store!.pinnedMessage);
  });

  it('закреплённое, которого нет среди загруженного, достаётся одним запросом; переход — листает', async () => {
    const { client } = await started({ initialTimelineLimit: 2 });
    store = new TimelineStore(client, demoRooms.weekend);
    expect(find(store, 'Кто что берёт на пикник?')).toBeUndefined();
    await until(() => store!.pinnedMessage?.kind.type === 'text');
    expect(store.pinnedMessage).toMatchObject({ kind: { body: 'Кто что берёт на пикник?' } });
    expect(await store.reveal(store.pinnedMessage!.eventId!)).toBe(true);
    expect(find(store, 'Кто что берёт на пикник?')).toBeDefined();
  });

  it('опрос: голос Веры уже есть; мой — добавляется, передумала — переносится', async () => {
    const { client } = await started();
    store = new TimelineStore(client, demoRooms.weekend);
    const poll = () => store!.messages.find((m) => m.kind.type === 'poll')!;
    const counts = () => (poll().kind.type === 'poll' ? Object.fromEntries((poll().kind as { poll: { answers: { id: string; votes: number }[] } }).poll.answers.map((a) => [a.id, a.votes])) : {});
    expect(counts()).toEqual({ lake: 1, forest: 0, home: 0 });
    store.vote(poll(), ['forest']);
    await until(() => counts()['forest'] === 1);
    expect(poll().kind).toMatchObject({ poll: { mine: ['forest'], voters: 2 } });
    store.vote(poll(), ['lake']);
    await until(() => counts()['lake'] === 2 && counts()['forest'] === 0);
  });

  it('«печатает…»: Вера отвечает на сообщение в «Выходных» и затихает', async () => {
    const { client } = await started();
    store = new TimelineStore(client, demoRooms.weekend);
    store.send('Кто за рулём?');
    await until(() => store!.typing.includes('Вера'));
    await until(() => store!.typing.length === 0, DEMO_TYPING_MS + 8000);
  }, 20_000);

  it('служебные подряд склеены: «Борис и Вера теперь в чате»', async () => {
    const { client } = await started();
    store = new TimelineStore(client, demoRooms.weekend);
    const service = store.items.find((i) => i.kind === 'message' && i.message.kind.type === 'service');
    expect(service).toMatchObject({ message: { kind: { event: { type: 'joined', people: ['Борис', 'Вера'] } } } });
  });
});
