import { describe, expect, it } from 'vitest';
import { engineOf, persistenceAdvice } from '../../src/core/storage/persistence';

const UA = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
};

const env = (userAgent: string, over: Partial<{ standalone: boolean; persisted: boolean; canPersist: boolean }> = {}) => ({
  userAgent,
  standalone: false,
  persisted: false,
  canPersist: true,
  ...over,
});

describe('persist() по браузерам', () => {
  it('движок по UA', () => {
    expect(engineOf(UA.chrome)).toBe('chromium');
    expect(engineOf(UA.edge)).toBe('chromium');
    expect(engineOf(UA.android)).toBe('chromium');
    expect(engineOf(UA.firefox)).toBe('gecko');
    expect(engineOf(UA.safari)).toBe('webkit');
  });

  it('Chromium — просим молча', () => {
    expect(persistenceAdvice(env(UA.chrome))).toBe('ask-silently');
    expect(persistenceAdvice(env(UA.android, { standalone: true }))).toBe('ask-silently');
  });

  it('Firefox — сначала объяснить', () => {
    expect(persistenceAdvice(env(UA.firefox))).toBe('explain-then-ask');
  });

  it('Safari во вкладке — только Dock; в Dock — молчим', () => {
    expect(persistenceAdvice(env(UA.safari))).toBe('install-to-dock');
    expect(persistenceAdvice(env(UA.safari, { persisted: true }))).toBe('install-to-dock');
    expect(persistenceAdvice(env(UA.safari, { standalone: true }))).toBe('none');
  });

  it('уже сохранено — молчим', () => {
    expect(persistenceAdvice(env(UA.firefox, { persisted: true }))).toBe('none');
    expect(persistenceAdvice(env(UA.chrome, { persisted: true }))).toBe('none');
  });
});
