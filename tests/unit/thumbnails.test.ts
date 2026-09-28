import { describe, expect, it, vi } from 'vitest';
import { ThumbnailCache, type ThumbnailSource } from '../../src/core/media/thumbnails';

function source(bytes = 10): ThumbnailSource & { calls: string[]; headers: unknown[] } {
  const calls: string[] = [];
  const headers: unknown[] = [];
  return {
    calls,
    headers,
    httpUrl: (mxc, size) => `https://hs.test/_matrix/client/v1/media/thumbnail/${mxc.slice(6)}?width=${size}`,
    accessToken: () => 'tok',
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push(url);
      headers.push(init?.headers);
      return new Response(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    }) as typeof fetch,
  };
}

describe('миниатюры', () => {
  it('с токеном, ступеньками размера, один запрос на одну картинку', async () => {
    const s = source();
    const cache = new ThumbnailCache(s);
    const [a, b] = await Promise.all([cache.load('mxc://hs/abc', 56), cache.load('mxc://hs/abc', 90)]);
    expect(a).toBe(b);
    expect(s.calls).toEqual(['https://hs.test/_matrix/client/v1/media/thumbnail/hs/abc?width=96']);
    expect(s.headers[0]).toEqual({ Authorization: 'Bearer tok' });
  });

  it('потолок по объёму: давние вытесняются и отзываются', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const cache = new ThumbnailCache(source(10), 25);
    const first = await cache.load('mxc://hs/1', 48);
    await cache.load('mxc://hs/2', 48);
    await cache.load('mxc://hs/3', 48);
    expect(revoke).toHaveBeenCalledWith(first);
    cache.clear();
    expect(revoke).toHaveBeenCalledTimes(3);
  });

  it('не картинка — не картинка', async () => {
    const cache = new ThumbnailCache({
      ...source(),
      fetch: (async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })) as typeof fetch,
    });
    expect(await cache.load('mxc://hs/x', 48)).toBeUndefined();
  });
});
