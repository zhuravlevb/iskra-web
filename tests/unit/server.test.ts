import { describe, expect, it } from 'vitest';
import { discoverServer, parseAddress, SignInError } from '../../src/core/auth/server';
import { deviceDisplayName } from '../../src/core/auth/signIn';

describe('адрес аккаунта', () => {
  it('домен — ищем через .well-known', () => {
    expect(parseAddress('matrix.org')).toEqual({ domain: 'matrix.org', demo: false });
    expect(parseAddress('  Matrix.ORG/ ')).toEqual({ domain: 'matrix.org', demo: false });
  });

  it('Matrix ID — домен и имя', () => {
    expect(parseAddress('@alice:example.org')).toEqual({ domain: 'example.org', username: 'alice', demo: false });
  });

  it('полный адрес — как есть; http только для своего компьютера', () => {
    expect(parseAddress('https://matrix-client.matrix.org/')).toEqual({
      baseUrl: 'https://matrix-client.matrix.org',
      demo: false,
    });
    expect(parseAddress('http://localhost:8008')).toEqual({ baseUrl: 'http://localhost:8008', demo: false });
    expect(parseAddress('http://example.org')).toBeNull();
  });

  it('демо — только полным адресом в зоне .invalid; короткое «demo» — только в разработке', () => {
    expect(parseAddress('demo.iskra.invalid')?.demo).toBe(true);
    expect(parseAddress('demo')).toBeNull();
    expect(parseAddress('demo', true)?.demo).toBe(true);
  });

  it('пустое и бессмысленное — null', () => {
    for (const input of ['', '   ', 'не адрес', 'foo bar', 'https://']) {
      expect(parseAddress(input), input).toBeNull();
    }
  });
});

describe('как сервер впускает', () => {
  it('демо: пароль и legacy SSO, без OAuth', async () => {
    const info = await discoverServer('demo.iskra.invalid');
    expect(info).toMatchObject({ demo: true, password: true, sso: true, canRegister: false });
    expect(info.oauth).toBeUndefined();
  });

  it('бессмысленный адрес — «не нашли»', async () => {
    await expect(discoverServer('не адрес')).rejects.toEqual(new SignInError('notFound'));
  });
});

describe('имя устройства', () => {
  it('браузер и система', () => {
    expect(
      deviceDisplayName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'),
    ).toBe('Iskra Web (Chrome, Windows)');
    expect(deviceDisplayName('Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0')).toBe(
      'Iskra Web (Firefox, Linux)',
    );
    expect(
      deviceDisplayName('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'),
    ).toBe('Iskra Web (Chrome, Android)');
    expect(deviceDisplayName('curl/8')).toBe('Iskra Web');
  });
});
