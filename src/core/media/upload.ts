/**
 * Отправка вложения — **единственный путь** файла на сервер (см. план, «Медиа»).
 *
 * `uploadContent` ничего не шифрует: файл, загруженный как есть в зашифрованную комнату,
 * лежит на сервере открытым — та же ловушка, что `Client.uploadMedia` в нативной Искре.
 * Здесь решается по состоянию комнаты, шифровать ли, и в зашифрованной комнате и сам
 * файл, и его миниатюра сначала проходят `encryptAttachment` (AES-CTR, ключ и хэш — в
 * `file`, а не в `url`), и только шифротекст уходит на сервер — без имени и без типа.
 * Кнопка, вставка из буфера и перетаскивание ведут сюда же; другого пути наверх нет.
 *
 * «Зашифрована ли комната» при сомнении — «да»: лишнее шифрование ничего не стоит, а
 * лишняя открытость — всё.
 */
import { encryptAttachment } from 'matrix-encrypt-attachment';
import type { MatrixClient } from 'matrix-js-sdk';

export type OutgoingKind = 'image' | 'video' | 'audio' | 'file';

/** Файл, подготовленный экраном: размеры, длительность и миниатюра посчитаны до отправки. */
export interface OutgoingFile {
  blob: Blob;
  name: string;
  mimetype: string;
  kind: OutgoingKind;
  width?: number;
  height?: number;
  /** мс */
  duration?: number;
  thumbnail?: { blob: Blob; width: number; height: number; mimetype: string };
}

export interface UploadClient {
  isEncrypted(roomId: string): Promise<boolean>;
  /** Загрузить байты, вернуть `mxc://`. */
  upload(body: Blob, options: { name?: string; type: string; onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal }): Promise<string>;
  send(roomId: string, content: Record<string, unknown>): Promise<unknown>;
}

export interface SendOptions {
  caption?: string;
  replyTo?: { eventId: string; senderId: string; own: boolean };
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

const MSGTYPE: Record<OutgoingKind, string> = { image: 'm.image', video: 'm.video', audio: 'm.audio', file: 'm.file' };

export async function sendAttachment(client: UploadClient, roomId: string, file: OutgoingFile, options: SendOptions = {}): Promise<void> {
  const encrypted = await client.isEncrypted(roomId);
  const info: Record<string, unknown> = { mimetype: file.mimetype, size: file.blob.size };
  if (file.width && file.height) {
    info['w'] = Math.round(file.width);
    info['h'] = Math.round(file.height);
  }
  if (file.duration !== undefined) info['duration'] = Math.round(file.duration);

  // Миниатюра — первой: она маленькая, и ей прогресс не нужен.
  if (file.thumbnail) {
    const thumb = await put(client, file.thumbnail.blob, file.thumbnail.mimetype, undefined, encrypted, options.signal);
    Object.assign(info, encrypted ? { thumbnail_file: thumb.file } : { thumbnail_url: thumb.url });
    info['thumbnail_info'] = {
      w: Math.round(file.thumbnail.width),
      h: Math.round(file.thumbnail.height),
      mimetype: file.thumbnail.mimetype,
      size: file.thumbnail.blob.size,
    };
  }
  const main = await put(client, file.blob, file.mimetype, file.name, encrypted, options.signal, options.onProgress);

  const caption = options.caption?.trim();
  const content: Record<string, unknown> = {
    msgtype: MSGTYPE[file.kind],
    // Подпись по Matrix 1.10: `body` — подпись, имя — в `filename`.
    body: caption || file.name,
    ...(caption ? { filename: file.name } : {}),
    info,
    ...(encrypted ? { file: main.file } : { url: main.url }),
  };
  if (options.replyTo) {
    content['m.relates_to'] = { 'm.in_reply_to': { event_id: options.replyTo.eventId } };
    content['m.mentions'] = options.replyTo.own ? {} : { user_ids: [options.replyTo.senderId] };
  }
  await client.send(roomId, content);
}

async function put(
  client: UploadClient,
  blob: Blob,
  type: string,
  name: string | undefined,
  encrypted: boolean,
  signal?: AbortSignal,
  onProgress?: (fraction: number) => void,
): Promise<{ url?: string; file?: Record<string, unknown> }> {
  const progress = onProgress ? (loaded: number, total: number) => total && onProgress(Math.min(1, loaded / total)) : undefined;
  if (!encrypted) {
    const url = await client.upload(blob, { ...(name ? { name } : {}), type, ...(progress ? { onProgress: progress } : {}), ...(signal ? { signal } : {}) });
    return { url };
  }
  const { data, info } = await encryptAttachment(await blob.arrayBuffer());
  // Шифротекст — без имени и без типа: серверу незачем знать, что это было.
  const url = await client.upload(new Blob([data], { type: 'application/octet-stream' }), {
    type: 'application/octet-stream',
    ...(progress ? { onProgress: progress } : {}),
    ...(signal ? { signal } : {}),
  });
  return { file: { ...info, url } };
}

/**
 * `UploadClient` поверх настоящего клиента. `viaFetch` — загрузка своим `fetch`, а не
 * `uploadContent`: тот в браузере идёт через `XMLHttpRequest` (ради прогресса) мимо
 * `fetchFn` клиента — и демо-сервер, живущий в `fetchFn`, его бы не увидел.
 */
export function uploadClientFor(client: MatrixClient, viaFetch?: typeof globalThis.fetch): UploadClient {
  return {
    async isEncrypted(roomId) {
      const byState = !!client.getRoom(roomId)?.hasEncryptionStateEvent();
      if (byState) return true;
      try {
        return (await client.getCrypto()?.isEncryptionEnabledInRoom(roomId)) ?? false;
      } catch {
        // Не знаем — шифруем.
        return true;
      }
    },
    async upload(body, { name, type, onProgress, signal }) {
      if (viaFetch) {
        const url = new URL(`${client.getHomeserverUrl().replace(/\/$/, '')}/_matrix/media/v3/upload`);
        if (name) url.searchParams.set('filename', name);
        const response = await viaFetch(url.href, {
          method: 'POST',
          body,
          headers: { 'Content-Type': type, Authorization: `Bearer ${client.getAccessToken() ?? ''}` },
          ...(signal ? { signal } : {}),
        });
        if (!response.ok) throw new Error(`upload failed: ${response.status}`);
        onProgress?.(body.size, body.size);
        return ((await response.json()) as { content_uri: string }).content_uri;
      }
      const controller = new AbortController();
      signal?.addEventListener('abort', () => controller.abort(), { once: true });
      const response = await client.uploadContent(body as never, {
        type,
        includeFilename: !!name,
        ...(name ? { name } : {}),
        ...(onProgress ? { progressHandler: ({ loaded, total }: { loaded: number; total: number }) => onProgress(loaded, total) } : {}),
        abortController: controller,
      });
      return response.content_uri;
    },
    send: (roomId, content) => client.sendMessage(roomId, content as never),
  };
}
