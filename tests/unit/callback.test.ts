import { describe, expect, it } from 'vitest';
import { parseAuthCallback } from '../../src/core/auth/callback';

describe('возврат со страницы входа', () => {
  it('OAuth во фрагменте — код забран, адрес чист', () => {
    const r = parseAuthCallback('https://web.iskra.test/#code=secret-code&state=abc');
    expect(r.callback).toEqual({ kind: 'oauth', code: 'secret-code', state: 'abc' });
    expect(r.cleanUrl).toBe('https://web.iskra.test/');
    expect(r.cleanUrl).not.toContain('secret');
  });

  it('OAuth в query тоже', () => {
    const r = parseAuthCallback('https://web.iskra.test/?state=abc&code=c2');
    expect(r.callback).toEqual({ kind: 'oauth', code: 'c2', state: 'abc' });
    expect(r.cleanUrl).toBe('https://web.iskra.test/');
  });

  it('отказ на стороне сервера — это возврат, а не «ничего не было»', () => {
    const r = parseAuthCallback('https://web.iskra.test/#error=access_denied&state=abc');
    expect(r.callback).toEqual({ kind: 'oauth-error', error: 'access_denied', state: 'abc' });
    expect(r.cleanUrl).toBe('https://web.iskra.test/');
  });

  it('legacy SSO', () => {
    const r = parseAuthCallback('https://web.iskra.test/?loginToken=tok#/');
    expect(r.callback).toEqual({ kind: 'sso', loginToken: 'tok' });
    expect(r.cleanUrl).toBe('https://web.iskra.test/');
  });

  it('обычный адрес чата не трогается', () => {
    const href = 'https://web.iskra.test/#/room/!abc%3Amatrix.org';
    expect(parseAuthCallback(href)).toEqual({ callback: null, cleanUrl: href });
  });
});
