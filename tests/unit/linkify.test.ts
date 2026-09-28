import { describe, expect, it } from 'vitest';
import { linkify } from '../../src/design/linkify';
import { dayLabel } from '../../src/design/time';

describe('ссылки в тексте', () => {
  it('ссылка посреди фразы, пунктуация — не часть адреса', () => {
    expect(linkify('Смотри https://matrix.org/docs, там всё.')).toEqual([
      { text: 'Смотри ' },
      { text: 'https://matrix.org/docs', href: 'https://matrix.org/docs' },
      { text: ', там всё.' },
    ]);
  });

  it('www. — с https', () => {
    expect(linkify('www.example.org')).toEqual([{ text: 'www.example.org', href: 'https://www.example.org' }]);
  });

  it('скобки: своя — внутри адреса, чужая — снаружи', () => {
    expect(linkify('(см. https://example.org/a)')[1]).toEqual({ text: 'https://example.org/a', href: 'https://example.org/a' });
    expect(linkify('https://ru.wikipedia.org/wiki/Искра_(значения)')[0]!.text).toBe('https://ru.wikipedia.org/wiki/Искра_(значения)');
  });

  it('без ссылок — один кусок; «javascript:» ссылкой не становится', () => {
    expect(linkify('просто текст')).toEqual([{ text: 'просто текст' }]);
    expect(linkify('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }]);
  });
});

describe('разделитель дней', () => {
  const now = new Date(2026, 8, 28, 15).getTime();
  it('сегодня, вчера, дата, дата с годом', () => {
    const day = (d: number, y = 2026) => new Date(y, 8, d, 10).getTime();
    expect(dayLabel(day(28), now, 'ru', 'Сегодня', 'Вчера')).toBe('Сегодня');
    expect(dayLabel(day(27), now, 'ru', 'Сегодня', 'Вчера')).toBe('Вчера');
    expect(dayLabel(day(12), now, 'ru', 'Сегодня', 'Вчера')).toBe('12 сентября');
    expect(dayLabel(day(12, 2025), now, 'ru', 'Сегодня', 'Вчера')).toBe('12 сентября 2025 г.');
  });
});
