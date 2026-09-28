import { describe, expect, it } from 'vitest';
import { formatRoute, isRoomId, parseRoute } from '../../src/core/navigation/route';

describe('адрес', () => {
  it('чат туда и обратно', () => {
    const route = { name: 'room', roomId: '!abc:matrix.org' } as const;
    expect(formatRoute(route)).toBe('#/room/!abc%3Amatrix.org');
    expect(parseRoute(formatRoute(route))).toEqual(route);
    expect(parseRoute('#/room/!abc:matrix.org')).toEqual(route);
  });

  it('всё незнакомое — домой, а не ошибка', () => {
    for (const hash of ['', '#', '#/', '#/room/', '#/room/not-a-room', '#/room/%E0%A4%A', '#/settings', '#/room/!a:b/extra']) {
      expect(parseRoute(hash), hash).toEqual({ name: 'home' });
    }
  });

  it('ID комнаты — и ничего больше', () => {
    expect(isRoomId('!abc:matrix.org')).toBe(true);
    expect(isRoomId('!abc:localhost:8448')).toBe(true);
    expect(isRoomId('#alias:matrix.org')).toBe(false);
    expect(isRoomId('!abc matrix.org')).toBe(false);
    expect(isRoomId('!abc')).toBe(false);
  });
});
