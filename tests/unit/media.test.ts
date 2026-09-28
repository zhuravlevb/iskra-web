import { describe, expect, it } from 'vitest';
import { decryptAttachment } from 'matrix-encrypt-attachment';
import { sendAttachment, type OutgoingFile, type UploadClient } from '../../src/core/media/upload';
import { displayType, MediaError, MediaLoader } from '../../src/core/media/media';

const PHOTO = new TextEncoder().encode('это фото озера, честное слово');
const THUMB = new TextEncoder().encode('это его миниатюра');

function fakeClient(encrypted: boolean) {
  const uploads: Array<{ bytes: Uint8Array; name?: string; type: string }> = [];
  const sent: Array<Record<string, unknown>> = [];
  const client: UploadClient = {
    isEncrypted: async () => encrypted,
    upload: async (body, { name, type }) => {
      uploads.push({ bytes: new Uint8Array(await body.arrayBuffer()), ...(name ? { name } : {}), type });
      return `mxc://hs/${uploads.length}`;
    },
    send: async (_roomId, content) => {
      sent.push(content);
    },
  };
  return { client, uploads, sent };
}

const photo = (): OutgoingFile => ({
  blob: new Blob([PHOTO], { type: 'image/jpeg' }),
  name: 'lake.jpg',
  mimetype: 'image/jpeg',
  kind: 'image',
  width: 1200,
  height: 800,
  thumbnail: { blob: new Blob([THUMB], { type: 'image/jpeg' }), width: 300, height: 200, mimetype: 'image/jpeg' },
});

describe('отправка вложения', () => {
  it('зашифрованная комната: ни `url`, ни `thumbnail_url`; на сервер — только шифротекст без имени', async () => {
    const { client, uploads, sent } = fakeClient(true);
    await sendAttachment(client, '!r:hs', photo(), { caption: 'Озеро' });
    const content = sent[0]!;
    expect(content['url']).toBeUndefined();
    expect((content['info'] as Record<string, unknown>)['thumbnail_url']).toBeUndefined();
    expect(content).toMatchObject({ msgtype: 'm.image', body: 'Озеро', filename: 'lake.jpg', info: { w: 1200, h: 800, mimetype: 'image/jpeg' } });

    for (const upload of uploads) {
      expect(upload.name).toBeUndefined();
      expect(upload.type).toBe('application/octet-stream');
      expect(new TextDecoder().decode(upload.bytes)).not.toContain('озера');
      expect(new TextDecoder().decode(upload.bytes)).not.toContain('миниатюра');
    }
    // И расшифровывается обратно — ключом из события.
    const file = content['file'] as { url: string };
    const cipher = uploads[Number(file.url.split('/').pop()) - 1]!.bytes;
    const plain = await decryptAttachment(cipher.slice().buffer, file as never);
    expect(new TextDecoder().decode(plain)).toBe('это фото озера, честное слово');
    const thumbFile = (content['info'] as Record<string, unknown>)['thumbnail_file'] as { url: string };
    expect(thumbFile.url).toMatch(/^mxc:\/\//);
  });

  it('открытая комната: `url`, имя и тип уходят как есть; без подписи `body` — имя файла', async () => {
    const { client, uploads, sent } = fakeClient(false);
    await sendAttachment(client, '!r:hs', photo(), { replyTo: { eventId: '$q', senderId: '@anya:hs', own: false } });
    expect(sent[0]).toMatchObject({
      msgtype: 'm.image',
      body: 'lake.jpg',
      url: 'mxc://hs/2',
      info: { thumbnail_url: 'mxc://hs/1', thumbnail_info: { w: 300, h: 200 } },
      'm.relates_to': { 'm.in_reply_to': { event_id: '$q' } },
      'm.mentions': { user_ids: ['@anya:hs'] },
    });
    expect(sent[0]!['filename']).toBeUndefined();
    expect(sent[0]!['file']).toBeUndefined();
    expect(uploads[1]).toMatchObject({ name: 'lake.jpg', type: 'image/jpeg' });
  });
});

describe('скачивание вложения', () => {
  it('зашифрованное — расшифровывается с проверкой хэша; подмена — ошибка, а не картинка', async () => {
    const { client, uploads, sent } = fakeClient(true);
    await sendAttachment(client, '!r:hs', photo());
    const file = sent[0]!['file'] as { url: string } & Record<string, unknown>;
    const { url, ...key } = file;
    let tamper = false;
    const loader = new MediaLoader({
      downloadUrl: (mxc) => `https://hs/dl/${mxc.split('/').pop()}`,
      thumbnailUrl: () => null,
      accessToken: () => 'tok',
      fetch: (async (address: string) => {
        const bytes = uploads[Number(address.split('/').pop()) - 1]!.bytes.slice();
        if (tamper) bytes[0] = bytes[0]! ^ 1;
        return new Response(bytes);
      }) as typeof fetch,
    });
    const blob = await loader.blob({ mxc: url, encryption: key as never }, 'image/jpeg');
    expect(blob.type).toBe('image/jpeg');
    expect(new TextDecoder().decode(await blob.arrayBuffer())).toBe('это фото озера, честное слово');
    tamper = true;
    await expect(loader.blob({ mxc: url, encryption: key as never }, 'image/jpeg')).rejects.toEqual(new MediaError('tampered'));
  });

  it('тип `Blob` — из короткого списка; чужой HTML — просто байты', () => {
    expect(displayType('image/png')).toBe('image/png');
    expect(displayType('video/mp4; codecs=avc1')).toBe('video/mp4');
    expect(displayType('text/html')).toBe('application/octet-stream');
    expect(displayType(undefined)).toBe('application/octet-stream');
  });
});
