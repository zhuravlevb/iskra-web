import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverServer } from '../../src/core/auth/server';
import { signInWithPassword } from '../../src/core/auth/signIn';
import { demoServer } from '../../src/core/demo/instance';
import { UserSession } from '../../src/core/session/userSession.svelte.ts';
import { vault } from '../../src/core/storage/vault';

let session: UserSession | undefined;
afterEach(async () => {
  session?.stop();
  session = undefined;
  await vault.destroy();
});

const noop = { onTokensRefreshed: async () => {}, onLoggedOut: () => {} };

async function databases(): Promise<string[]> {
  return (await indexedDB.databases()).map((d) => d.name ?? '');
}

async function waitFor(condition: () => boolean, ms = 10_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('сессия против демо-сервера', () => {
  it('вход паролем → сессия с Rust-крипто → выход стирает все базы пользователя', async () => {
    const server = await discoverServer('demo.iskra.invalid');
    const fresh = await signInWithPassword(server, 'alice', 'password');
    expect(fresh.method).toBe('demo');

    const { account, secrets } = await vault.add(fresh);
    session = await UserSession.start(account, secrets, noop);
    await waitFor(() => session!.ready);
    expect(session.connection).toBe('online');

    const mine = (await databases()).filter((n) => n.includes(account.userId));
    expect(mine.some((n) => n.includes('matrix-sdk-crypto'))).toBe(true);
    expect(mine.some((n) => n.includes('iskra-sync'))).toBe(true);

    await session.signOut();
    expect((await databases()).filter((n) => n.includes(account.userId))).toEqual([]);
    expect(demoServer().unknown).toEqual([]);
  }, 30_000);
});
