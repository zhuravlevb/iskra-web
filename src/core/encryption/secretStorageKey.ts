/**
 * Ключ секретного хранилища — тот, что стоит за кодом восстановления.
 *
 * SDK просит его колбэком (`cryptoCallbacks.getSecretStorageKey`), когда ему надо прочитать
 * или записать секрет: ключи кросс-подписи, ключ резервной копии. Держим его **только**
 * на время одной операции — ввели код, создали код, — и сразу забываем. Ни на диск, ни в
 * IndexedDB: код существует ровно затем, чтобы пережить потерю этого устройства, и копия
 * на нём же была бы бессмыслицей.
 */
import type { CryptoCallbacks } from 'matrix-js-sdk/lib/crypto-api';

export class SecretStorageKeyHolder {
  private key: { keyId: string | null; bytes: Uint8Array<ArrayBuffer> } | null = null;

  /** Ключ на время операции. `keyId` — если известен; иначе подойдёт к любому запросу. */
  hold(bytes: Uint8Array<ArrayBuffer>, keyId: string | null = null): void {
    this.key = { keyId, bytes };
  }

  forget(): void {
    if (this.key) this.key.bytes.fill(0);
    this.key = null;
  }

  readonly callbacks: CryptoCallbacks = {
    getSecretStorageKey: async ({ keys }) => {
      const held = this.key;
      if (!held) return null;
      const ids = Object.keys(keys);
      const keyId = held.keyId && ids.includes(held.keyId) ? held.keyId : ids[0];
      return keyId ? [keyId, held.bytes] : null;
    },
    // Новый ключ, только что созданный `bootstrapSecretStorage`, — тот же, что мы держим.
    cacheSecretStorageKey: (keyId, _info, bytes) => {
      this.key = { keyId, bytes };
    },
  };
}
