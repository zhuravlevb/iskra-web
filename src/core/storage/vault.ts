/**
 * Аккаунт на этом устройстве: кто, где и с какими ключами.
 *
 * Открыто лежит только то, что не секрет: Matrix ID, устройство, адрес сервера, как вошли.
 * Access token, refresh token и ключ криптохранилища — под `seal`, неизвлекаемым ключом
 * этого же аккаунта. Ключ — свой у каждого аккаунта и удаляется вместе с ним.
 *
 * Черновики — здесь же, под тем же ключом: черновик — это текст сообщения, и лежать на
 * диске открытым ему не положено больше, чем токену. Уходят вместе с аккаунтом.
 */
import { deleteDatabase, openDatabase, transact } from './idb';
import { createSealingKey, randomBase64, seal, unseal, type Sealed } from './secretBox';

const DB_NAME = 'iskra-accounts';
const DB_VERSION = 2;
const ACCOUNTS = 'accounts';
const DRAFTS = 'drafts';

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

interface StoredDraft {
  userId: string;
  roomId: string;
  sealed: Sealed;
}

/** Все черновики одного аккаунта — диапазон составного ключа `[userId, roomId]`. */
const draftsOf = (userId: string) => IDBKeyRange.bound([userId, ''], [userId, '\uffff']);

interface StoredAccount extends Account {
  key: CryptoKey;
  sealed: Sealed;
}

export type NewAccount = Omit<Account, 'signedInAt'> & Omit<AccountSecrets, 'cryptoStorageKey'>;

function open(): Promise<IDBDatabase> {
  return openDatabase(DB_NAME, DB_VERSION, (db) => {
    if (!db.objectStoreNames.contains(ACCOUNTS)) db.createObjectStore(ACCOUNTS, { keyPath: 'userId' });
    if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: ['userId', 'roomId'] });
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
    await withDb(async (db) => {
      await transact(db, DRAFTS, 'readwrite', (s) => s.delete(draftsOf(userId)));
      await transact(db, ACCOUNTS, 'readwrite', (s) => s.delete(userId));
    });
  },

  /** Черновик чата — или пусто. Не расшифровался (ключ сменился) — считаем, что его нет. */
  async draft(userId: string, roomId: string): Promise<string> {
    return withDb(async (db) => {
      const [account, draft] = await Promise.all([
        transact(db, ACCOUNTS, 'readonly', (s) => s.get(userId) as IDBRequest<StoredAccount | undefined>),
        transact(db, DRAFTS, 'readonly', (s) => s.get([userId, roomId]) as IDBRequest<StoredDraft | undefined>),
      ]);
      if (!account || !draft) return '';
      return unseal<string>(account.key, draft.sealed).catch(() => '');
    });
  },

  /** Пустой текст — черновика нет: запись удаляется, а не хранит пустоту. */
  async saveDraft(userId: string, roomId: string, text: string): Promise<void> {
    await withDb(async (db) => {
      if (!text.trim()) {
        await transact(db, DRAFTS, 'readwrite', (s) => s.delete([userId, roomId]));
        return;
      }
      const account = await transact(db, ACCOUNTS, 'readonly', (s) => s.get(userId) as IDBRequest<StoredAccount | undefined>);
      if (!account) return;
      // Шифруем до транзакции: транзакция IndexedDB закрывается на первом же await.
      const sealed = await seal(account.key, text);
      const draft: StoredDraft = { userId, roomId, sealed };
      await transact(db, DRAFTS, 'readwrite', (s) => s.put(draft));
    });
  },

  /** Для тестов и «стереть всё»: база аккаунтов целиком. */
  async destroy(): Promise<void> {
    await deleteDatabase(DB_NAME);
  },
};
