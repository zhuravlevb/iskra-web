/**
 * Жизнь приложения от открытия вкладки до выхода — одна машина состояний:
 *
 *   loading → signed-out ⇄ signing-in → signed-in
 *                               ↘ elsewhere (аккаунт открыт в другой вкладке)
 *
 * Порядок при старте:
 * 1. возврат со страницы входа — забран и стёрт из адреса ещё в `main.ts`;
 * 2. аккаунт из хранилища;
 * 3. лок одной вкладки — не получили, клиент не поднимаем;
 * 4. сессия.
 */
import type { AuthCallback } from '../auth/callback';
import { SignInError, type SignInProblem } from '../auth/server';
import { completeSignIn } from '../auth/signIn';
import {
  currentEnvironment,
  isPersisted,
  persistenceAdvice,
  requestPersistence,
  type PersistenceAdvice,
} from '../storage/persistence';
import { vault, type Account, type NewAccount } from '../storage/vault';
import { SessionLock } from './lock';
import { UserSession, wipeUserData } from './userSession.svelte.ts';

export type Phase =
  | { name: 'loading' }
  | { name: 'signed-out'; problem?: SignInProblem; ended?: boolean }
  | { name: 'elsewhere'; userId: string }
  | { name: 'signed-in'; session: UserSession };

export interface AppHooks {
  /** Другая вкладка просит показаться: окно может не дать себя сфокусировать — тогда мигнуть. */
  onFocusRequested?: () => void;
}

export class AppState {
  phase = $state<Phase>({ name: 'loading' });
  /** Что сказать про хранилище после входа — см. `persistence.ts`. */
  persistence = $state<PersistenceAdvice>('none');
  /**
   * Шаг между входом и чатами: восстановление переписки. Идёт после каждого *нового* входа
   * (не после перезагрузки страницы — там о запертой переписке напомнит плашка в списке).
   */
  recoveryStep = $state(false);
  /**
   * Первый запуск после *нового* входа: привет по имени, цвет, мордочки (`FirstRunView`
   * нативной Искры). После восстановления, а не до: вопрос о том, прочитает ли устройство
   * переписку, важнее вопроса о цвете.
   */
  firstRun = $state(false);

  private lock: SessionLock | null = null;
  private hooks: AppHooks = {};

  async boot(callback: AuthCallback | null, hooks: AppHooks = {}): Promise<void> {
    this.hooks = hooks;
    if (callback) {
      if (callback.kind === 'oauth-error') {
        // Человек сам отказался или сервер отказал. Код ожидания всё равно забрать.
        await completeSignIn(callback).catch(() => {});
        this.phase = { name: 'signed-out', problem: 'ssoIncomplete' };
        return;
      }
      try {
        await this.finishSignIn(await completeSignIn(callback));
      } catch (error) {
        this.phase = { name: 'signed-out', problem: problemOf(error, 'ssoIncomplete') };
      }
      return;
    }

    let account: Account | undefined;
    try {
      account = await vault.current();
    } catch {
      this.phase = { name: 'signed-out', problem: 'storageUnavailable' };
      return;
    }
    if (!account) {
      this.phase = { name: 'signed-out' };
      return;
    }
    await this.open(account);
  }

  /** Вход с паролем или в демо — без редиректа. */
  async signIn(account: NewAccount): Promise<void> {
    await this.finishSignIn(account);
  }

  private async finishSignIn(fresh: NewAccount): Promise<void> {
    this.recoveryStep = true;
    this.firstRun = true;
    // Демо стирается при каждом новом входе: своя база, ни следа прошлого запуска.
    if (fresh.method === 'demo') await wipeUserData(fresh.userId).catch(() => {});
    let account: Account;
    try {
      ({ account } = await vault.add(fresh));
    } catch (error) {
      throw new SignInError('storageUnavailable', { cause: error });
    }
    await this.open(account);
  }

  private async open(account: Account): Promise<void> {
    this.lock = await SessionLock.acquire(account.userId, this.lockCallbacks());
    if (!this.lock) {
      this.phase = { name: 'elsewhere', userId: account.userId };
      return;
    }
    await this.startSession(account);
  }

  private lockCallbacks() {
    return {
      onFocusRequested: () => this.hooks.onFocusRequested?.(),
      onTakenOver: async () => {
        if (this.phase.name === 'signed-in') {
          const userId = this.phase.session.userId;
          this.phase.session.stop();
          this.phase = { name: 'elsewhere', userId };
        }
        this.lock = null;
      },
    };
  }

  private async startSession(account: Account): Promise<void> {
    const secrets = await vault.secrets(account.userId).catch(() => undefined);
    if (!secrets) {
      this.releaseLock();
      this.phase = { name: 'signed-out', problem: 'storageUnavailable' };
      return;
    }
    let session: UserSession;
    try {
      session = await UserSession.start(account, secrets, {
        onTokensRefreshed: (tokens) => vault.updateTokens(account.userId, tokens),
        onLoggedOut: () => void this.sessionEnded(),
      });
    } catch {
      // Не поднялось криптохранилище или база синхронизации. Аккаунт не трогаем:
      // следующая попытка может пройти, а удалить ключи — необратимо.
      this.releaseLock();
      this.phase = { name: 'signed-out', problem: 'storageUnavailable' };
      return;
    }
    this.phase = { name: 'signed-in', session };
    void this.checkPersistence();
    // Где стоит переписка — для плашки «Старая переписка заблокирована». На новом входе
    // шаг восстановления спросит сам.
    if (!this.recoveryStep) void session.recovery?.refresh();
  }

  private async checkPersistence(): Promise<void> {
    const advice = persistenceAdvice(currentEnvironment(await isPersisted()));
    if (advice === 'ask-silently') {
      await requestPersistence();
      this.persistence = 'none';
      return;
    }
    this.persistence = advice;
  }

  /** Firefox: человек прочитал объяснение и нажал «Разрешить». */
  async askPersistence(): Promise<void> {
    await requestPersistence();
    this.persistence = persistenceAdvice(currentEnvironment(await isPersisted()));
  }

  /** Шаг восстановления пройден (или отложен) — дальше чаты. */
  finishRecovery(): void {
    this.recoveryStep = false;
  }

  /** Первый запуск пройден или пропущен — дальше чаты. */
  finishFirstRun(): void {
    this.firstRun = false;
  }

  /** Плашка «Старая переписка заблокирована» — вернуться к шагу восстановления. */
  openRecovery(): void {
    this.recoveryStep = true;
  }

  dismissPersistence(): void {
    this.persistence = 'none';
  }

  /** «Перейти туда». */
  focusOther(): void {
    if (this.phase.name === 'elsewhere') SessionLock.requestFocus(this.phase.userId);
  }

  /** «Открыть здесь»: та вкладка останавливается и показывает тот же экран у себя. */
  async takeOver(): Promise<void> {
    if (this.phase.name !== 'elsewhere') return;
    const userId = this.phase.userId;
    this.phase = { name: 'loading' };
    this.lock = await SessionLock.takeOver(userId, this.lockCallbacks());
    const account = await vault.current();
    if (!account || account.userId !== userId) {
      this.releaseLock();
      this.phase = { name: 'signed-out' };
      return;
    }
    await this.startSession(account);
  }

  async signOut(): Promise<void> {
    if (this.phase.name !== 'signed-in') return;
    const session = this.phase.session;
    this.phase = { name: 'loading' };
    await session.signOut();
    await vault.remove(session.userId).catch(() => {});
    this.releaseLock();
    this.phase = { name: 'signed-out' };
  }

  /** Сервер больше не принимает этот сеанс: локально удаляем всё и просим войти снова. */
  private async sessionEnded(): Promise<void> {
    if (this.phase.name !== 'signed-in') return;
    const session = this.phase.session;
    await session.wipe();
    await vault.remove(session.userId).catch(() => {});
    this.releaseLock();
    this.phase = { name: 'signed-out', ended: true };
  }

  private releaseLock(): void {
    this.lock?.release();
    this.lock = null;
  }
}

function problemOf(error: unknown, fallback: SignInProblem): SignInProblem {
  return error instanceof SignInError ? error.problem : fallback;
}

export const app = new AppState();
