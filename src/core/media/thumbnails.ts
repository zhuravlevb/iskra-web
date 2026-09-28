/**
 * Миниатюры — аватарки в списке, позже превью в ленте.
 *
 * Authenticated media (`/_matrix/client/v1/media/…`) требует заголовка `Authorization`,
 * поэтому `<img src="mxc→https">` не работает: каждая картинка — это `fetch` с токеном →
 * `Blob` → `URL.createObjectURL`. Кэш — в памяти, на время сессии, с потолком по объёму:
 * вкладка, открытая неделю, не должна копить гигабайт картинок. Вытесненное — `revoke`.
 */

export interface ThumbnailSource {
  /** `mxc://` → https-адрес миниатюры (authenticated). */
  httpUrl(mxc: string, sizePx: number): string | null;
  accessToken(): string | null;
  fetch: typeof globalThis.fetch;
}

interface Entry {
  url: string;
  bytes: number;
}

export class ThumbnailCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<string | undefined>>();
  private bytes = 0;

  constructor(
    private readonly source: ThumbnailSource,
    private readonly limitBytes = 32 * 1024 * 1024,
  ) {}

  /** Object URL миниатюры или `undefined`, если не вышло. Никогда не бросает. */
  load(mxc: string, sizePx: number): Promise<string | undefined> {
    // Запрашиваем с запасом под плотные экраны и ступеньками, чтобы кэш попадал.
    const size = [48, 96, 192, 384].find((s) => s >= sizePx) ?? 384;
    const key = `${mxc}@${size}`;
    const hit = this.entries.get(key);
    if (hit) {
      // Свежий — в конец: вытесняем самые давние.
      this.entries.delete(key);
      this.entries.set(key, hit);
      return Promise.resolve(hit.url);
    }
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const task = this.fetchOne(mxc, size).then((entry) => {
      this.inflight.delete(key);
      if (!entry) return undefined;
      this.entries.set(key, entry);
      this.bytes += entry.bytes;
      this.evict();
      return entry.url;
    });
    this.inflight.set(key, task);
    return task;
  }

  private async fetchOne(mxc: string, size: number): Promise<Entry | undefined> {
    const url = this.source.httpUrl(mxc, size);
    const token = this.source.accessToken();
    if (!url) return undefined;
    try {
      const response = await this.source.fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
      if (!response.ok) return undefined;
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) return undefined;
      return { url: URL.createObjectURL(blob), bytes: blob.size };
    } catch {
      return undefined;
    }
  }

  private evict(): void {
    for (const [key, entry] of this.entries) {
      if (this.bytes <= this.limitBytes) break;
      URL.revokeObjectURL(entry.url);
      this.bytes -= entry.bytes;
      this.entries.delete(key);
    }
  }

  /** Сессия закончилась — ни одной расшифрованной или скачанной картинки не остаётся. */
  clear(): void {
    for (const entry of this.entries.values()) URL.revokeObjectURL(entry.url);
    this.entries.clear();
    this.bytes = 0;
  }
}
