import { describe, expect, it } from 'vitest';
import { headersFile, securityHeaders } from '../../security-headers';

describe('CSP — главная граница', () => {
  const csp = securityHeaders(false)['Content-Security-Policy']!;
  const directive = (name: string) =>
    csp.split('; ').find((d) => d.startsWith(`${name} `))?.slice(name.length + 1).split(' ') ?? [];

  it('никаких unsafe-inline и unsafe-eval в сборке', () => {
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('скрипты — только свои и WASM', () => {
    expect(directive('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
  });

  it('картинки — свои, blob: и data:, и никаких чужих хостов', () => {
    expect(directive('img-src')).toEqual(["'self'", 'blob:', 'data:']);
  });

  it('в рамку не вставить', () => {
    expect(directive('frame-ancestors')).toEqual(["'none'"]);
  });

  it('Trusted Types включены', () => {
    expect(directive('require-trusted-types-for')).toEqual(["'script'"]);
  });

  it('_headers несёт ту же политику', () => {
    expect(headersFile()).toContain(`Content-Security-Policy: ${csp}`);
  });
});
