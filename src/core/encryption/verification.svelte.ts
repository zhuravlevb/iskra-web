/**
 * Подтверждение устройства — сверка семи эмодзи, в обе стороны, как в нативной Искре.
 *
 * Правила оттуда же:
 * - лист поднимается из корня приложения, поверх чего угодно;
 * - сравнение запускает та сторона, которая просила;
 * - ни «совпадают», ни «это я» не выделены — решает человек;
 * - имена эмодзи не показываются: сравнивают картинки, а не слова на двух языках.
 *
 * Самый частый сценарий на десктопе — «сел за новый компьютер, телефон в руке»:
 * подтверждение с телефона, где стоит нативная Искра.
 */
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api/CryptoEvent';
import {
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type ShowSasCallbacks,
  type VerificationRequest,
  type Verifier,
} from 'matrix-js-sdk/lib/crypto-api/verification';
import type { MatrixClient } from 'matrix-js-sdk';

const SAS = 'm.sas.v1';

export type VerificationStep =
  /** Другое устройство просит подтвердить его: «это я» / «это не я». */
  | { name: 'asked'; deviceName: string }
  /** Мы попросили — ждём, пока другое устройство согласится. */
  | { name: 'waiting' }
  /** Согласились — устройства договариваются. */
  | { name: 'negotiating' }
  /** Семь эмодзи на обоих экранах. */
  | { name: 'compare'; emoji: string[] }
  | { name: 'done' }
  /** Другая сторона отменила или эмодзи не совпали. */
  | { name: 'declined' }
  /** Мы сказали «это не я». */
  | { name: 'refused' }
  | { name: 'failed' };

export class VerificationStore {
  step = $state<VerificationStep | null>(null);

  private request: VerificationRequest | null = null;
  private sas: ShowSasCallbacks | null = null;
  private verifier: Verifier | null = null;
  private readonly detach: Array<() => void> = [];
  /** Чем кончилось — для шага восстановления: подтвердили ли это устройство. */
  private onVerified: (() => void) | undefined;

  constructor(private readonly client: MatrixClient) {
    const onRequest = (request: VerificationRequest) => {
      // Только свои устройства и только если сейчас ничего не идёт.
      if (!request.isSelfVerification || request.initiatedByMe || this.request) return;
      this.track(request);
      this.step = { name: 'asked', deviceName: '' };
      void this.deviceName(request.otherDeviceId).then((name) => {
        if (this.request === request && this.step?.name === 'asked') this.step = { name: 'asked', deviceName: name };
      });
    };
    const target = client as unknown as { on(e: string, h: (r: VerificationRequest) => void): void; off(e: string, h: (r: VerificationRequest) => void): void };
    target.on(CryptoEvent.VerificationRequestReceived, onRequest);
    this.detach.push(() => target.off(CryptoEvent.VerificationRequestReceived, onRequest));
  }

  /** Как устройство назвало себя — «Iskra (iPhone)». Пусто — экран скажет «Устройство без имени». */
  private async deviceName(deviceId: string | undefined): Promise<string> {
    if (!deviceId) return '';
    try {
      const me = this.client.getSafeUserId();
      const devices = await this.client.getCrypto()!.getUserDeviceInfo([me]);
      return devices.get(me)?.get(deviceId)?.displayName ?? '';
    } catch {
      return '';
    }
  }

  /** «Подтвердить с другого устройства». */
  async start(onVerified?: () => void): Promise<void> {
    this.cancelCurrent();
    this.onVerified = onVerified;
    this.step = { name: 'waiting' };
    try {
      const request = await this.client.getCrypto()!.requestOwnUserVerification();
      this.track(request);
    } catch {
      this.step = { name: 'failed' };
    }
  }

  /** «Это я» — принять запрос другого устройства. Сравнение запустит оно. */
  async accept(): Promise<void> {
    const request = this.request;
    if (!request) return;
    this.step = { name: 'negotiating' };
    try {
      await request.accept();
    } catch {
      this.step = { name: 'failed' };
    }
  }

  /** «Это не я» — отказать. Устройство не получит доступа к переписке. */
  async refuse(): Promise<void> {
    const request = this.request;
    this.step = { name: 'refused' };
    this.request = null;
    await request?.cancel({ reason: 'User declined', code: 'm.user' }).catch(() => {});
  }

  /** «Совпадают». */
  async match(): Promise<void> {
    const sas = this.sas;
    if (!sas) return;
    this.step = { name: 'negotiating' };
    try {
      await sas.confirm();
    } catch {
      this.step = { name: 'failed' };
    }
  }

  /** «Не совпадают» — не доверять этому подключению. */
  mismatch(): void {
    this.sas?.mismatch();
    this.step = { name: 'declined' };
  }

  /** Закрыть лист. Идущее — отменить. */
  close(): void {
    this.cancelCurrent();
    this.step = null;
  }

  private cancelCurrent(): void {
    const request = this.request;
    this.request = null;
    this.sas = null;
    this.verifier = null;
    if (request && request.phase !== VerificationPhase.Done && request.phase !== VerificationPhase.Cancelled) {
      void request.cancel().catch(() => {});
    }
  }

  private track(request: VerificationRequest): void {
    this.request = request;
    const onChange = () => {
      if (this.request !== request) {
        request.off(VerificationRequestEvent.Change, onChange);
        return;
      }
      switch (request.phase) {
        case VerificationPhase.Ready:
          // Сравнение запускает та сторона, которая просила.
          if (request.initiatedByMe) {
            this.step = { name: 'negotiating' };
            void request.startVerification(SAS).then((v) => this.watch(v), () => (this.step = { name: 'failed' }));
          }
          break;
        case VerificationPhase.Started:
          if (request.verifier && request.verifier !== this.verifier) this.watch(request.verifier);
          break;
        case VerificationPhase.Done:
          this.finish();
          break;
        case VerificationPhase.Cancelled:
          if (this.step?.name !== 'refused' && this.step?.name !== 'done') this.step = { name: 'declined' };
          this.request = null;
          break;
      }
    };
    request.on(VerificationRequestEvent.Change, onChange);
    onChange();
  }

  private watch(verifier: Verifier): void {
    this.verifier = verifier;
    verifier.on(VerifierEvent.ShowSas, (sas) => {
      this.sas = sas;
      // Имена эмодзи не показываем: сравнивают картинки.
      this.step = { name: 'compare', emoji: (sas.sas.emoji ?? []).map(([emoji]) => emoji) };
    });
    verifier.verify().then(
      () => this.finish(),
      () => {
        if (this.step?.name !== 'declined' && this.step?.name !== 'refused') this.step = { name: 'failed' };
      },
    );
  }

  private finish(): void {
    if (this.step?.name === 'done') return;
    this.step = { name: 'done' };
    this.request = null;
    this.sas = null;
    const done = this.onVerified;
    this.onVerified = undefined;
    done?.();
  }

  destroy(): void {
    this.cancelCurrent();
    for (const off of this.detach.splice(0)) off();
  }
}
