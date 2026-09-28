/**
 * Миниатюры аватарок — лица в списке и в ленте.
 *
 * Authenticated media (`/_matrix/client/v1/media/…`) требует заголовка `Authorization`,
 * поэтому `<img src="mxc→https">` не работает: каждая картинка — это `fetch` с токеном →
 * `Blob` → `URL.createObjectURL`, в кэше с потолком (`BlobCache`).
 */
import { BlobCache } from './blobCache';

export interface ThumbnailSource {
  /** `mxc://` → https-адрес миниатюры (authenticated). */
  httpUrl(mxc: string, sizePx: number): string | null;
  accessToken(): string | null;
  fetch: typeof globalThis.fetch;
}

/** Ступеньки размера: с запасом под плотные экраны, и чтобы кэш попадал. */
export const THUMBNAIL_STEPS = [48, 96, 192, 384, 768] as const;
export const thumbnailStep = (sizePx: number): number => THUMBNAIL_STEPS.find((s) => s >= sizePx) ?? THUMBNAIL_STEPS.at(-1)!;

export class ThumbnailCache {
  private readonly cache: BlobCache;

  constructor(
    private readonly source: ThumbnailSource,
    limitBytes = 32 * 1024 * 1024,
  ) {
    this.cache = new BlobCache(limitBytes);
  }

  /** Object URL миниатюры или `undefined`, если не вышло. Никогда не бросает. */
  load(mxc: string, sizePx: number): Promise<string | undefined> {
    const size = Math.min(thumbnailStep(sizePx), 384);
    return this.cache.get(`${mxc}@${size}`, () => this.fetchOne(mxc, size));
  }

  private async fetchOne(mxc: string, size: number): Promise<Blob | undefined> {
    const url = this.source.httpUrl(mxc, size);
    const token = this.source.accessToken();
    if (!url) return undefined;
    const response = await this.source.fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return blob.type.startsWith('image/') ? blob : undefined;
  }

  clear(): void {
    this.cache.clear();
  }
}
