/**
 * Восстановление переписки — `RecoveryStore` нативной Искры, на `CryptoApi` из
 * `matrix-js-sdk`.
 *
 * Всё прячется за одним словом — **код восстановления** (см. `matrix-device-recovery-flow.md`
 * нативной Искры). Ни «кросс-подписи», ни «секретного хранилища» человек не видит; здесь —
 * то, как эта механика раскладывается за одним понятием.
 *
 * Состояние одно из четырёх, и путать два из них нельзя никогда:
 *
 * - `off`  — **бэкапа нет** (новый аккаунт): создать его сразу и показать код один раз;
 * - `keyNeeded` — бэкап есть, а это устройство его не откроет: ввести код или подтвердить
 *   с другого устройства;
 * - `on` — всё открыто;
 * - `unknown` — **не знаю**: что-то не ответило. «Не знаю» и «бэкапа нет» — разные ответы;
 *   перепутать их — значит создать новый бэкап поверх живого и стереть переписку, ради
 *   которой человек вошёл. На «не знаю» ничего не делаем — пускаем в приложение, где плашка
 *   спросит ещё раз.
 */
import { decodeRecoveryKey, type CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import type { UIAuthCallback } from 'matrix-js-sdk';
import type { MatrixClient } from 'matrix-js-sdk';
import type { SecretStorageKeyHolder } from './secretStorageKey';

export type HistoryProtection = 'unknown' | 'on' | 'off' | 'keyNeeded';

/** Что не получилось — ключи текстов нативной Искры (`account.*Failed`). */
export type RecoveryFailure = 'protectFailed' | 'restoreFailed' | 'staleCodeFailed' | 'newKeyFailed' | 'startOverFailed';

/** Сервер спрашивает, правда ли это вы, прежде чем выбросить старые ключи. */
export type AuthRequest = { kind: 'password' } | { kind: 'approve'; url: string };

export class RecoveryCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'RecoveryCancelled';
  }
}

const SETUP_TIMEOUT_MS = 30_000;

export class RecoveryStore {
  protection = $state<HistoryProtection>('unknown');
  working = $state(false);
  failure = $state<RecoveryFailure | null>(null);
  /** Вопрос сервера посреди «Начать заново»: пароль или одобрение на его странице. */
  authRequest = $state<AuthRequest | null>(null);

  private answer: { resolve: (value: string | null) => void; reject: (error: Error) => void } | null = null;

  constructor(
    private readonly client: MatrixClient,
    private readonly keys: SecretStorageKeyHolder,
  ) {}

  private get crypto(): CryptoApi {
    const crypto = this.client.getCrypto();
    if (!crypto) throw new Error('Crypto is not initialised');
    return crypto;
  }

  /** Где стоит аккаунт. Никогда не бросает: не ответило — `unknown`. */
  async refresh(): Promise<HistoryProtection> {
    try {
      this.protection = await withTimeout(this.read(), SETUP_TIMEOUT_MS);
    } catch {
      this.protection = 'unknown';
    }
    return this.protection;
  }

  private async read(): Promise<HistoryProtection> {
    const crypto = this.crypto;
    const me = this.client.getSafeUserId();
    const [hasIdentity, backup, secretStorageKey] = await Promise.all([
      crypto.userHasCrossSigningKeys(me, true),
      // `null` — сервер ответил «бэкапа нет». Ошибка сети — бросит, и это «не знаю».
      crypto.getKeyBackupInfo(),
      this.client.secretStorage.getDefaultKeyId(),
    ]);
    if (!hasIdentity && !backup && !secretStorageKey) return 'off';

    const device = await crypto.getDeviceVerificationStatus(me, this.client.getDeviceId()!);
    if (!device?.crossSigningVerified) return 'keyNeeded';
    // Устройство доверенное, но кода восстановления у аккаунта нет — сделать его можно отсюда.
    return secretStorageKey && backup ? 'on' : 'off';
  }

  private begin(): void {
    this.working = true;
    this.failure = null;
  }

  // ————— Новый аккаунт: включить бэкап и отдать код —————

  /**
   * Включает резервную копию и создаёт код — без вопросов: нет такой формулировки «хотите,
   * чтобы переписка пережила потерю телефона», на которую отвечают «нет» нарочно.
   *
   * Код отдаётся вызывающему и нигде здесь не остаётся: показать его можно ровно один раз.
   */
  async protectHistory(): Promise<string | null> {
    if (this.working) return null;
    this.begin();
    try {
      const crypto = this.crypto;
      const hadBackup = !!(await crypto.getKeyBackupInfo());
      const generated = await crypto.createRecoveryKeyFromPassphrase();
      this.keys.hold(generated.privateKey);
      await crypto.bootstrapCrossSigning({ authUploadDeviceSigningKeys: this.uia() });
      await crypto.bootstrapSecretStorage({
        createSecretStorageKey: async () => generated,
        setupNewSecretStorage: true,
        // Живой бэкап не трогаем никогда: новый — только если его не было.
        setupNewKeyBackup: !hadBackup,
      });
      await crypto.checkKeyBackupAndEnable();
      this.protection = 'on';
      return generated.encodedPrivateKey ?? null;
    } catch {
      this.failure = 'protectFailed';
      return null;
    } finally {
      this.keys.forget();
      this.working = false;
    }
  }

  // ————— Новое устройство: ввести код —————

  /**
   * Код → доступ к переписке. Неверный по форме — «не подошёл»; верный по форме, но от
   * другого ключа — «составлен верно и всё-таки не подходит» (код создавали заново).
   */
  async restore(code: string): Promise<boolean> {
    const typed = code.trim();
    if (!typed || this.working) return false;
    this.begin();
    try {
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = decodeRecoveryKey(typed);
      } catch {
        this.failure = 'restoreFailed';
        return false;
      }
      const storage = this.client.secretStorage;
      const keyId = await storage.getDefaultKeyId();
      const description = keyId ? await storage.getKey(keyId) : null;
      if (!keyId || !description) {
        this.failure = 'restoreFailed';
        return false;
      }
      if (!(await storage.checkKey(bytes, description[1] as never))) {
        this.failure = 'staleCodeFailed';
        return false;
      }
      this.keys.hold(bytes, keyId);
      const crypto = this.crypto;
      // Ключи кросс-подписи — из хранилища, и этим же вызовом устройство подписывает себя.
      await crypto.bootstrapCrossSigning({});
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      await crypto.checkKeyBackupAndEnable();
      // Старые ключи переписки — в фоне: их может быть много, а человек уже внутри.
      void crypto.restoreKeyBackup().catch(() => {});
      this.protection = 'on';
      return true;
    } catch {
      this.failure = 'restoreFailed';
      return false;
    } finally {
      this.keys.forget();
      this.working = false;
    }
  }

  // ————— Новый код взамен старого —————

  /**
   * Старый код перестаёт работать в ту же секунду — и вернуть его нельзя. Сюда приходят
   * только через вопрос «Создать новый код?».
   */
  async makeNewKey(): Promise<string | null> {
    if (this.working) return null;
    this.begin();
    try {
      const crypto = this.crypto;
      const generated = await crypto.createRecoveryKeyFromPassphrase();
      this.keys.hold(generated.privateKey);
      await crypto.bootstrapSecretStorage({
        createSecretStorageKey: async () => generated,
        setupNewSecretStorage: true,
      });
      this.protection = 'on';
      return generated.encodedPrivateKey ?? null;
    } catch {
      this.failure = 'newKeyFailed';
      return null;
    } finally {
      this.keys.forget();
      this.working = false;
    }
  }

  /** Есть ли другое устройство, которое может поручиться за это. Спрашиваем, только когда код потерян. */
  async hasOtherDevices(): Promise<boolean> {
    try {
      const me = this.client.getSafeUserId();
      const mine = this.client.getDeviceId();
      const devices = (await this.crypto.getUserDeviceInfo([me], true)).get(me);
      for (const [id, device] of devices ?? []) {
        if (id === mine || device.dehydrated) continue;
        // «Подписано владельцем», а не «проверено»: это устройство само ещё не доверяет личности
        // аккаунта, и для него чужие устройства «не проверены» — но поручиться могут.
        const status = await this.crypto.getDeviceVerificationStatus(me, id);
        if (status?.signedByOwner) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ————— С чистого листа —————

  /**
   * Нет ни кода, ни другого устройства. Старая переписка остаётся на сервере — зашифрованной,
   * и ключей от неё нет ни у кого. Новая личность, новый бэкап, новый код.
   *
   * Сервер почти всегда хочет убедиться, что это вы: пароль — или одобрение на его странице
   * (MAS). Об этом спрашивает `authRequest`.
   */
  async startOver(): Promise<string | null> {
    if (this.working) return null;
    this.begin();
    try {
      await this.crypto.resetEncryption(this.uia());
    } catch (error) {
      this.working = false;
      if (!(error instanceof RecoveryCancelled)) this.failure = 'startOverFailed';
      return null;
    }
    this.working = false;
    // Личность новая, бэкап создан — остался код, и без него следующее устройство окажется
    // ровно в этом же положении.
    return this.makeNewKey();
  }

  /** Человек ввёл пароль. */
  answerPassword(password: string): void {
    this.settle((a) => a.resolve(password));
  }

  /** Человек говорит, что одобрил сброс на странице сервера. */
  answerApproved(): void {
    this.settle((a) => a.resolve(null));
  }

  /** Передумал — ничего не выбрасываем. */
  cancelAuth(): void {
    this.settle((a) => a.reject(new RecoveryCancelled()));
  }

  private settle(action: (answer: NonNullable<RecoveryStore['answer']>) => void): void {
    const answer = this.answer;
    this.answer = null;
    this.authRequest = null;
    if (answer) action(answer);
  }

  private ask(request: AuthRequest): Promise<string | null> {
    this.authRequest = request;
    return new Promise((resolve, reject) => (this.answer = { resolve, reject }));
  }

  /**
   * Интерактивная аутентификация сервера (UIA). Сначала — без неё: для первых ключей
   * кросс-подписи серверы её не требуют (MSC3967). Попросил — спросить человека.
   */
  private uia(): UIAuthCallback<void> {
    return async (makeRequest) => {
      try {
        await makeRequest(null);
        return;
      } catch (error) {
        const data = (error as { httpStatus?: number; data?: Record<string, unknown> }).data;
        const flows = (data?.['flows'] as Array<{ stages?: string[] }> | undefined) ?? [];
        if ((error as { httpStatus?: number }).httpStatus !== 401 || flows.length === 0) throw error;
        const session = data?.['session'] as string | undefined;
        const stages = flows.flatMap((f) => f.stages ?? []);
        if (stages.includes('m.login.password')) {
          const password = await this.ask({ kind: 'password' });
          await makeRequest({
            type: 'm.login.password',
            identifier: { type: 'm.id.user', user: this.client.getSafeUserId() },
            password: password ?? '',
            ...(session ? { session } : {}),
          } as never);
          return;
        }
        const resetStage = 'org.matrix.cross_signing_reset';
        if (stages.includes(resetStage)) {
          // MAS: сброс одобряется на странице сервера. Проверить на настоящем MAS (этап 0).
          const params = (data?.['params'] as Record<string, { url?: string }> | undefined)?.[resetStage];
          await this.ask({ kind: 'approve', url: params?.url ?? '' });
          await makeRequest({ type: resetStage, ...(session ? { session } : {}) } as never);
          return;
        }
        throw error;
      }
    };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
