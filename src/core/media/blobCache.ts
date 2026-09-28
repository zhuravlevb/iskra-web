/**
 * Object URL по ключу — в памяти, на время сессии, с потолком по объёму (см. план,
 * «Медиа»): вкладка, открытая неделю, не должна копить гигабайт картинок. Вытесненное —
 * `revokeObjectURL`, давнее — первым. Два запроса за одним и тем же — один `fetch`.
 */
interface Entry {
  url: string;
  bytes: number;
}

export class BlobCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<string | undefined>>();
  private bytes = 0;

  constructor(private readonly limitBytes: number) {}

  /** Готовое — сразу; нет — `load`, и результат в кэш. Никогда не бросает. */
  get(key: string, load: () => Promise<Blob | undefined>): Promise<string | undefined> {
    const hit = this.entries.get(key);
    if (hit) {
      // Свежий — в конец: вытесняем самые давние.
      this.entries.delete(key);
      this.entries.set(key, hit);
      return Promise.resolve(hit.url);
    }
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const task = load()
      .catch(() => undefined)
      .then((blob) => {
        this.inflight.delete(key);
        if (!blob) return undefined;
        const entry = { url: URL.createObjectURL(blob), bytes: blob.size };
        this.entries.set(key, entry);
        this.bytes += entry.bytes;
        this.evict();
        return entry.url;
      });
    this.inflight.set(key, task);
    return task;
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
