/**
 * Шаг между входом и чатами — `RecoverySetupModel` нативной Искры.
 *
 * Три пути, и какой из них — решает один вопрос: есть ли у аккаунта резервная копия и может
 * ли *это* устройство её открыть.
 *
 * - **Бэкапа нет** (новый аккаунт): создать, не спрашивая, и показать код один раз.
 * - **Бэкап есть, но не открыть**: два равноправных пути — ввести код или подтвердить с
 *   другого устройства. Ни один не «основной».
 * - **Ни того, ни другого**: сказать прямо, выбросить старое шифрование и начать с чистого
 *   листа.
 */
import type { HistoryProtection, RecoveryStore } from '../../core/encryption/recovery.svelte.ts';
import type { VerificationStore } from '../../core/encryption/verification.svelte.ts';

export type RecoveryStepName =
  | 'preparing'
  | 'creating'
  | 'code'
  | 'choose'
  | 'entering'
  | 'lost'
  | 'confirmNew'
  | 'startingOver'
  | 'done';

/**
 * Куда ведёт состояние аккаунта. Отдельной функцией — чтобы её можно было проверить тестом:
 * отправить аккаунт с живым бэкапом в «создание» — значит сбросить бэкап и стереть ту самую
 * переписку, ради которой человек вошёл.
 */
export function routeFor(protection: HistoryProtection): RecoveryStepName {
  switch (protection) {
    case 'off':
      return 'creating';
    case 'keyNeeded':
      return 'choose';
    // `unknown` — «не знаю», и на «не знаю» не действуют: пустить в приложение обратимо,
    // а угадать — нет. Плашка и настройки на месте.
    case 'on':
    case 'unknown':
      return 'done';
  }
}

export class RecoveryFlow {
  step = $state<RecoveryStepName>('preparing');
  /** Только что созданный код — ровно пока он на экране. Нигде больше не хранится. */
  code = $state<string | null>(null);
  typedCode = $state('');
  hasOtherDevices = $state(false);

  /** Что делать после сверки с другим устройством: из «потерял код» — дать новый код. */
  private afterConfirming: 'finish' | 'offerNewCode' = 'finish';

  constructor(
    readonly recovery: RecoveryStore,
    private readonly verification: VerificationStore | null,
    private readonly onDone: () => void,
  ) {}

  async begin(): Promise<void> {
    this.step = 'preparing';
    const step = routeFor(await this.recovery.refresh());
    if (step === 'creating') await this.create();
    else if (step === 'done') this.finish();
    else this.step = step;
  }

  private async create(): Promise<void> {
    this.step = 'creating';
    const code = await this.recovery.protectHistory();
    if (!code) {
      // Не вышло, и сделать тут человеку нечего. Пускаем в приложение — плашка спросит снова.
      this.finish();
      return;
    }
    this.code = code;
    this.step = 'code';
  }

  /** «Я сохранил код» — верим на слово: сверять не с чем, а «введите код обратно» учит копировать. */
  savedCode(): void {
    this.code = null;
    this.finish();
  }

  chooseCode(): void {
    this.step = 'entering';
  }

  async unlock(): Promise<void> {
    if (await this.recovery.restore(this.typedCode)) {
      this.typedCode = '';
      this.finish();
    }
    // Не подошёл — ошибка на экране, «Не могу найти код» под ней.
  }

  confirmFromAnotherDevice(): void {
    this.afterConfirming = 'finish';
    void this.verification?.start(() => this.confirmed());
  }

  private confirmed(): void {
    if (this.afterConfirming === 'finish') {
      void this.recovery.refresh();
      this.finish();
    } else {
      // Вошли — а код, который потерян, так и не нашёлся. Новый — *предлагаем*: старый код
      // всё ещё открывает хранилище, и создать новый — значит убить его, может быть, в тот
      // день, когда он нашёлся бы в менеджере паролей.
      this.step = 'confirmNew';
    }
  }

  async lostTheCode(): Promise<void> {
    this.hasOtherDevices = await this.recovery.hasOtherDevices();
    this.step = 'lost';
  }

  recoverWithAnotherDevice(): void {
    this.afterConfirming = 'offerNewCode';
    void this.verification?.start(() => this.confirmed());
  }

  /** Устройство у аккаунта есть, а у человека его нет — продали, утонуло, не открывается. */
  noAccessToOtherDevice(): void {
    this.hasOtherDevices = false;
  }

  async confirmNewCode(): Promise<void> {
    const code = await this.recovery.makeNewKey();
    if (!code) {
      this.finish();
      return;
    }
    this.code = code;
    this.step = 'code';
  }

  keepOldCode(): void {
    this.finish();
  }

  async startOver(): Promise<void> {
    this.step = 'startingOver';
    const code = await this.recovery.startOver();
    if (!code) {
      // Отказался на вопросе сервера или не вышло — всё осталось как было.
      this.step = 'lost';
      return;
    }
    this.code = code;
    this.step = 'code';
  }

  /** Закрыть — отложить. О запертой переписке напомнит плашка в списке чатов. */
  close(): void {
    this.finish();
  }

  private finish(): void {
    this.code = null;
    this.step = 'done';
    this.onDone();
  }
}
