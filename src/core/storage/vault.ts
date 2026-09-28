/**
 * Аккаунт на этом устройстве: кто, где и с какими ключами.
 *
 * Открыто лежит только то, что не секрет: Matrix ID, устройство, адрес сервера, как вошли.
 * Access token, refresh token и ключ криптохранилища — под `seal`, неизвлекаемым ключом
 * этого же аккаунта. Ключ — свой у каждого аккаунта и удаляется вместе с ним.
 *
 * Черновики (этап 6) лягут сюда же, под тот же ключ: черновик — это текст сообщения.
 */
import { deleteDatabase, openDatabase, transact } from './idb';
import { createSealingKey, randomBase64, seal, unseal, type Sealed } from './secretBox';

const DB_NAME = 'iskra-accounts';
const DB_VERSION = 1;
const ACCOUNTS = 'accounts';

export type SignInMethod = 'password' | 'sso' | 'oauth' | 'demo';

/** Что нужно, чтобы обновлять токены через OAuth 2.0 (MAS). */
export interface OAuthGrant {
  clientId: string;
  redirectUri: string;
  /** `ValidatedAuthMetadata` сервера авторизации, как её вернул сервер. */
  metadata: Record<string, unknown>;
}

export interface AccountSecrets {
  accessToken: string;
  refreshToken?: string;
  /** 32 байта в base64 — ключ, которым Rust-крипто шифрует свою базу. */
  cryptoStorageKey: string;
}

export interface Account {
  userId: string;
  deviceId: string;
  homeserverUrl: string;
  method: SignInMethod;
  oauth?: OAuthGrant;
  signedInAt: number;
}

interface StoredAccount extends Account {
  key: CryptoKey;
  sealed: Sealed;
}

export type NewAccount = Omit<Account, 'signedInAt'> & Omit<AccountSecrets, 'cryptoStorageKey'>;

function open(): Promise<IDBDatabase> {
  return openDatabase(DB_NAME, DB_VERSION, (db) => {
    if (!db.objectStoreNames.contains(ACCOUNTS)) db.createObjectStore(ACCOUNTS, { keyPath: 'userId' });
  });
}

async function withDb<T>(body: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await open();
  try {
    return await body(db);
  } finally {
    db.close();
  }
}

function publicPart({ key: _key, sealed: _sealed, ...account }: StoredAccount): Account {
  return account;
}

export const vault = {
  /** Сохраняет новый аккаунт и заводит ему ключи. Прежняя запись с тем же ID заменяется. */
  async add(account: NewAccount): Promise<{ account: Account; secrets: AccountSecrets }> {
    const { accessToken, refreshToken, ...rest } = account;
    const secrets: AccountSecrets = {
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
      cryptoStorageKey: randomBase64(32),
    };
    const key = await createSealingKey();
    const stored: StoredAccount = { ...rest, signedInAt: Date.now(), key, sealed: await seal(key, secrets) };
    await withDb((db) => transact(db, ACCOUNTS, 'readwrite', (s) => s.put(stored)));
    return { account: publicPart(stored), secrets };
  },

  /** Последний вошедший. Несколько аккаунтов — позже; пока одна вкладка — один аккаунт. */
  async current(): Promise<Account | undefined> {
    const all = await withDb((db) => transact(db, ACCOUNTS, 'readonly', (s) => s.getAll() as IDBRequest<StoredAccount[]>));
    const latest = all.sort((a, b) => b.signedInAt - a.signedInAt)[0];
    return latest ? publicPart(latest) : undefined;
  },

  async secrets(userId: string): Promise<AccountSecrets | undefined> {
    const stored = await withDb((db) =>
      transact(db, ACCOUNTS, 'readonly', (s) => s.get(userId) as IDBRequest<StoredAccount | undefined>),
    );
    return stored ? unseal<AccountSecrets>(stored.key, stored.sealed) : undefined;
  },

  /** Новые токены после обновления — под тем же ключом. */
  async updateTokens(userId: string, tokens: { accessToken: string; refreshToken?: string }): Promise<void> {
    await withDb(async (db) => {
      const stored = await transact(db, ACCOUNTS, 'readonly', (s) => s.get(userId) as IDBRequest<StoredAccount | undefined>);
      if (!stored) return;
      const secrets = await unseal<AccountSecrets>(stored.key, stored.sealed);
      const next: AccountSecrets = { ...secrets, accessToken: tokens.accessToken };
      if (tokens.refreshToken) next.refreshToken = tokens.refreshToken;
      // Шифруем до транзакции: транзакция IndexedDB закрывается на первом же await.
      const sealed = await seal(stored.key, next);
      await transact(db, ACCOUNTS, 'readwrite', (s) => s.put({ ...stored, sealed }));
    });
  },

  async remove(userId: string): Promise<void> {
    await withDb((db) => transact(db, ACCOUNTS, 'readwrite', (s) => s.delete(userId)));
  },

  /** Для тестов и «стереть всё»: база аккаунтов целиком. */
  async destroy(): Promise<void> {
    await deleteDatabase(DB_NAME);
  },
};
