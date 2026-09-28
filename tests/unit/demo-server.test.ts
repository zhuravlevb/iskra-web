import { afterEach, describe, expect, it } from 'vitest';
import { ClientEvent, createClient, Direction, EventType, SyncState, type MatrixClient } from 'matrix-js-sdk';
import { DemoHomeserver } from '../../src/core/demo/server';
import { demoRooms, demoUsers } from '../../src/core/demo/fixtures';
import { quietLogger } from '../../src/core/support/logger';

const logger = quietLogger();

const NOW = Date.UTC(2026, 8, 28, 12, 0, 0);

let client: MatrixClient | undefined;

afterEach(() => {
  client?.stopClient();
  client = undefined;
});

async function signedIn(server: DemoHomeserver): Promise<MatrixClient> {
  const anonymous = createClient({ baseUrl: server.baseUrl, fetchFn: server.fetch, logger });
  const login = await anonymous.loginRequest({
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user: 'alice' },
    password: 'password',
  });
  return createClient({
    baseUrl: server.baseUrl,
    fetchFn: server.fetch,
    logger,
    userId: login.user_id,
    deviceId: login.device_id,
    accessToken: login.access_token,
  });
}

async function started(server: DemoHomeserver): Promise<MatrixClient> {
  client = await signedIn(server);
  const prepared = new Promise<void>((resolve, reject) => {
    client!.on(ClientEvent.Sync, (state) => {
      if (state === SyncState.Prepared) resolve();
      if (state === SyncState.Error) reject(new Error('sync failed'));
    });
  });
  await client.startClient({ initialSyncLimit: 20 });
  await prepared;
  return client;
}

describe('демо-сервер под настоящим matrix-js-sdk', () => {
  it('впускает alice / password и не впускает с чужим паролем', async () => {
    const server = new DemoHomeserver({ now: NOW });
    const anonymous = createClient({ baseUrl: server.baseUrl, fetchFn: server.fetch, logger });
    await expect(
      anonymous.loginRequest({
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user: 'alice' },
        password: 'wrong',
      }),
    ).rejects.toMatchObject({ errcode: 'M_FORBIDDEN' });

    const login = await anonymous.loginRequest({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: 'alice' },
      password: 'password',
    });
    expect(login.user_id).toBe(demoUsers.alice);
    expect(server.unknown).toEqual([]);
  });

  it('варианты входа отдают свои способы', async () => {
    const flows = async (variant: 'password-only' | 'sso-only' | 'full') => {
      const server = new DemoHomeserver({ variant, now: NOW });
      const anonymous = createClient({ baseUrl: server.baseUrl, fetchFn: server.fetch, logger });
      const { flows } = await anonymous.loginFlows();
      return flows.map((f) => f.type);
    };
    expect(await flows('password-only')).toEqual(['m.login.password']);
    expect(await flows('sso-only')).toEqual(['m.login.sso', 'm.login.token']);
    expect(await flows('full')).toContain('m.login.password');
  });

  it('первая синхронизация приносит комнаты, приглашение и личный чат', async () => {
    const server = new DemoHomeserver({ now: NOW });
    const c = await started(server);

    const joined = c.getRooms().filter((r) => r.getMyMembership() === 'join');
    expect(joined.map((r) => r.roomId).sort()).toEqual(
      [demoRooms.anya, demoRooms.weekend, demoRooms.quiet, demoRooms.history].sort(),
    );
    expect(c.getRoom(demoRooms.invite)?.getMyMembership()).toBe('invite');
    expect(c.getRoom(demoRooms.weekend)?.name).toBe('Выходные');
    expect(c.getAccountData(EventType.Direct)?.getContent()).toEqual({ [demoUsers.anya]: [demoRooms.anya] });
    expect(server.unknown).toEqual([]);
  });

  it('длинную комнату можно долистать до начала', async () => {
    const server = new DemoHomeserver({ now: NOW });
    const c = await started(server);
    const room = c.getRoom(demoRooms.history)!;
    const timeline = room.getLiveTimeline();
    expect(timeline.getEvents()).toHaveLength(20);

    let more = true;
    while (more) more = await c.paginateEventTimeline(timeline, { backwards: true, limit: 100 });

    const bodies = timeline
      .getEvents()
      .filter((e) => e.getType() === 'm.room.message')
      .map((e) => e.getContent()['body']);
    expect(bodies).toHaveLength(400);
    expect(bodies[0]).toBe('Сообщение номер 1');
    expect(bodies[399]).toBe('Сообщение номер 400');
    expect(timeline.getPaginationToken(Direction.Backward)).toBeNull();
    expect(server.unknown).toEqual([]);
  });

  it('ничего не отправляет за пределы себя', async () => {
    const server = new DemoHomeserver({ now: NOW });
    await server.fetch('https://matrix.org/_matrix/client/versions');
    expect(server.unknown).toEqual(['GET https://matrix.org/_matrix/client/versions']);
  });
});
