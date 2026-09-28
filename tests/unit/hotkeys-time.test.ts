import { describe, expect, it } from 'vitest';
import { describe as describeChord, hotkeys, reserved, sameChord } from '../../src/design/hotkeys';
import { roomTimestamp } from '../../src/design/time';

describe('горячие клавиши', () => {
  const all = hotkeys.flatMap((h) => h.chords.map((c) => ({ id: h.id, chord: c })));

  it('на одном сочетании — одно действие', () => {
    for (const [i, a] of all.entries()) {
      for (const b of all.slice(i + 1)) expect(sameChord(a.chord, b.chord), `${a.id} и ${b.id}`).toBe(false);
    }
  });

  it('ничего, что заняли браузер и ОС', () => {
    for (const { id, chord } of all) {
      for (const taken of reserved) expect(sameChord(chord, taken), `${id}: ${describeChord(chord, false)}`).toBe(false);
    }
  });

  it('Ctrl на Windows и Linux, ⌘ на macOS', () => {
    expect(describeChord({ key: 'k', primary: true }, false)).toBe('Ctrl K');
    expect(describeChord({ key: 'k', primary: true }, true)).toBe('⌘K');
    expect(describeChord({ key: 'ArrowUp', alt: true, shift: true }, false)).toBe('Alt Shift ↑');
    expect(describeChord({ key: 'ArrowUp', alt: true }, true)).toBe('⌥↑');
  });
});

describe('время в строке списка', () => {
  const now = new Date(2026, 8, 28, 15, 0).getTime();
  const at = (days: number, h = 10, m = 5) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(h, m);
    return d.getTime();
  };

  it('сегодня — время, вчера — «Вчера»', () => {
    expect(roomTimestamp(at(0), now, 'ru', 'Вчера')).toBe('10:05');
    expect(roomTimestamp(at(1, 23, 59), now, 'ru', 'Вчера')).toBe('Вчера');
  });

  it('до шести дней — день недели, семь — уже дата', () => {
    expect(roomTimestamp(at(6), now, 'ru', 'Вчера')).toBe('вт');
    expect(roomTimestamp(at(7), now, 'ru', 'Вчера')).toBe('21.09.26');
    expect(roomTimestamp(at(7), now, 'en', 'Yesterday')).toBe('09/21/26');
  });

  it('полночь, а не 144 часа: вечер шестого дня — всё ещё день недели', () => {
    expect(roomTimestamp(at(6, 1, 0), now, 'ru', 'Вчера')).toBe('вт');
  });
});
