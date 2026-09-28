/**
 * Байты вложений: скачать с токеном, расшифровать, отдать.
 *
 * Два разных спроса (см. план, «Медиа»):
 * - **превью в ленте** — в кэше (`BlobCache`) с потолком: пролистали туда-обратно —
 *   не качаем заново;
 * - **оригинал** — для просмотрщика и «Сохранить» — не кэшируется вовсе: его object URL
 *   держит тот, кто открыл, и отзывает, когда закрыл. Закрыли экран — расшифрованная
 *   копия исчезла, как в нативной Искре.
 *
 * Расшифровка — `matrix-encrypt-attachment`, и SHA-256 шифротекста проверяется всегда:
 * вложение, чей хэш не сошёлся, — не вложение, а подмена.
 */
import { decryptAttachment } from 'matrix-encrypt-attachment';
import type { Attachment, MediaSource } from '../timeline/message';
import { BlobCache } from './blobCache';
import { thumbnailStep } from './thumbnails';

export interface MediaTransport {
  /** `mxc://` → https-адрес оригинала (authenticated). */
  downloadUrl(mxc: string): string | null;
  /** `mxc://` → https-адрес миниатюры, которую режет сервер. */
  thumbnailUrl(mxc: string, sizePx: number): string | null;
  accessToken(): string | null;
  fetch: typeof globalThis.fetch;
}

/** Зашифрованное без собственной миниатюры: превью — сам оригинал, но только небольшой. */
const DECRYPT_FOR_PREVIEW_MAX = 8 * 1024 * 1024;

/**
 * Какой тип дать `Blob`. Чужой `mimetype` — не доверие: браузер решает по нему, как
 * показывать. Картинки, видео и звук — из короткого списка; остальное — просто байты.
 * SVG — только в `<img>` (там он не исполняет скриптов), а по `blob:`-адресу мы никуда
 * не переходим — файлы скачиваются, а не открываются (см. план).
 */
export function displayType(mimetype: string | undefined): string {
  const type = (mimetype ?? '').toLowerCase().split(';')[0]!.trim();
  const safe = [
    /^image\/(jpeg|png|gif|webp|avif|bmp|svg\+xml)$/,
    /^video\/(mp4|webm|quicktime|ogg)$/,
    /^audio\/(mpeg|mp4|aac|ogg|opus|webm|wav|x-wav|flac|x-m4a)$/,
  ];
  return safe.some((re) => re.test(type)) ? type : 'application/octet-stream';
}

export class MediaError extends Error {
  constructor(readonly reason: 'unavailable' | 'tampered') {
    super(reason);
    this.name = 'MediaError';
  }
}

export class MediaLoader {
  private readonly previews: BlobCache;

  constructor(
    private readonly transport: MediaTransport,
    limitBytes = 64 * 1024 * 1024,
  ) {
    this.previews = new BlobCache(limitBytes);
  }

  /**
   * Превью вложения для ленты — object URL из кэша, или `undefined`, если показывать
   * нечего (видео без миниатюры, файл). Никогда не бросает.
   */
  preview(attachment: Attachment, sizePx: number): Promise<string | undefined> {
    const thumb = attachment.thumbnail;
    if (thumb) {
      return this.previews.get(`thumb:${thumb.source.mxc}`, () => this.blob(thumb.source, thumb.mimetype ?? 'image/jpeg'));
    }
    const source = attachment.source;
    const image = (attachment.mimetype ?? 'image/').startsWith('image/');
    if (!source || !image) return Promise.resolve(undefined);
    if (!source.encryption) {
      const size = thumbnailStep(sizePx);
      return this.previews.get(`${source.mxc}@${size}`, () => this.serverThumbnail(source.mxc, size));
    }
    // Зашифрованное сервер уменьшить не может: он видит шифротекст.
    if ((attachment.size ?? Infinity) > DECRYPT_FOR_PREVIEW_MAX) return Promise.resolve(undefined);
    return this.previews.get(`full:${source.mxc}`, () => this.blob(source, attachment.mimetype));
  }

  /**
   * Оригинал целиком — расшифрованный, с безопасным типом. Не кэшируется: object URL
   * заводит и отзывает тот, кто показывает. Бросает `MediaError`.
   */
  async blob(source: MediaSource, mimetype?: string, onProgress?: (fraction: number) => void): Promise<Blob> {
    const url = this.transport.downloadUrl(source.mxc);
    if (!url) throw new MediaError('unavailable');
    const token = this.transport.accessToken();
    let response: Response;
    try {
      response = await this.transport.fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    } catch {
      throw new MediaError('unavailable');
    }
    if (!response.ok) throw new MediaError('unavailable');
    const bytes = await readWithProgress(response, onProgress);
    const type = displayType(mimetype);
    if (!source.encryption) return new Blob([bytes], { type });
    try {
      const plain = await decryptAttachment(bytes, source.encryption as never);
      return new Blob([plain], { type });
    } catch {
      throw new MediaError('tampered');
    }
  }

  private async serverThumbnail(mxc: string, size: number): Promise<Blob | undefined> {
    const url = this.transport.thumbnailUrl(mxc, size);
    const token = this.transport.accessToken();
    if (!url) return undefined;
    const response = await this.transport.fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return blob.type.startsWith('image/') ? new Blob([blob], { type: displayType(blob.type) }) : undefined;
  }

  clear(): void {
    this.previews.clear();
  }
}

async function readWithProgress(response: Response, onProgress?: (fraction: number) => void): Promise<ArrayBuffer> {
  const total = Number(response.headers.get('Content-Length') ?? 0);
  if (!onProgress || !total || !response.body) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(Math.min(1, received / total));
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}
