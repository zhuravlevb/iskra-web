import { afterEach, describe, expect, it } from 'vitest';
import { ClientEvent, createClient, PendingEventOrdering, SyncState, type MatrixClient } from 'matrix-js-sdk';
import { DemoHomeserver, DEMO_SEND_FAILS_ONCE } from '../../src/core/demo/server';
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

async function started(): Promise<{ client: MatrixClient; server: DemoHomeserver }> {
  const server = new DemoHomeserver();
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
});
