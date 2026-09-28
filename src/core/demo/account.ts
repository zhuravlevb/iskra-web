/**
 * Аккаунт Алисы на демо-сервере: её устройства, ключи, данные аккаунта и резервная копия
 * ключей переписки.
 *
 * Это то, что у настоящего сервера живёт дольше одного устройства, — и здесь оно тоже
 * живёт дольше одной загрузки страницы: в `sessionStorage`, пока открыта вкладка. Так в
 * демо проходит весь путь «новый аккаунт → код восстановления → выход → вход заново, уже
 * новым устройством → ввести код», а не только его первая половина.
 *
 * Сама переписка к этому не относится: она строится из фикстур заново при каждой загрузке.
 */

export interface DemoBackup {
  version: string;
  algorithm: string;
  auth_data: Record<string, unknown>;
  etag: number;
  rooms: Record<string, { sessions: Record<string, unknown> }>;
}

export interface DemoAccountState {
  /** deviceId → загруженные ключи устройства. */
  devices: Record<string, { keys?: Record<string, unknown>; oneTimeKeys: number }>;
  /** Ключи кросс-подписи: `master_key`, `self_signing_key`, `user_signing_key`. */
  crossSigning: Record<string, Record<string, unknown>>;
  accountData: Record<string, unknown>;
  backups: DemoBackup[];
  nextDevice: number;
}

export interface DemoStorage {
  load(): DemoAccountState | null;
  save(state: DemoAccountState): void;
}

const STORAGE_KEY = 'iskra.demo.account';

/** Хранилище на время жизни вкладки — если оно есть (в тестах под Node его нет). */
export function sessionDemoStorage(): DemoStorage | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  return {
    load: () => {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as DemoAccountState) : null;
      } catch {
        return null;
      }
    },
    save: (state) => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Не сохранилось — демо просто забудет аккаунт при перезагрузке.
      }
    },
  };
}

export function emptyAccount(): DemoAccountState {
  return { devices: {}, crossSigning: {}, accountData: {}, backups: [], nextDevice: 1 };
}

type Signed = { signatures?: Record<string, Record<string, string>> };

/** Подписи из `keys/signatures/upload` — к ключам устройства или ключу кросс-подписи. */
export function mergeSignatures(state: DemoAccountState, userId: string, uploads: Record<string, Signed>): void {
  for (const [id, signed] of Object.entries(uploads)) {
    const target: Signed | undefined =
      (state.devices[id]?.keys as Signed | undefined) ??
      Object.values(state.crossSigning).find((key) =>
        Object.keys((key as { keys?: Record<string, string> }).keys ?? {}).some((keyId) => keyId.endsWith(`:${id}`) || keyId === id),
      );
    if (!target) continue;
    target.signatures ??= {};
    const mine = (target.signatures[userId] ??= {});
    Object.assign(mine, signed.signatures?.[userId] ?? {});
  }
}
