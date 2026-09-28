import { describe, expect, it } from 'vitest';
import { clampListWidth, LIST_IDEAL, LIST_MAX, LIST_MIN } from '../../src/design/columns';
import { layoutFor } from '../../src/design/breakpoints';

describe('колонки', () => {
  it('раскладка по ширине', () => {
    expect(layoutFor(390)).toBe('stack');
    expect(layoutFor(639)).toBe('stack');
    expect(layoutFor(640)).toBe('two');
    expect(layoutFor(1099)).toBe('two');
    expect(layoutFor(1100)).toBe('three');
    expect(layoutFor(3840)).toBe('three');
  });

  it('ширина списка — в пределах и на сетке в 4 px', () => {
    expect(clampListWidth(10)).toBe(LIST_MIN);
    expect(clampListWidth(100)).toBe(LIST_MAX);
    expect(clampListWidth(21.13)).toBe(21.25);
    expect(clampListWidth(Number.NaN)).toBe(LIST_IDEAL);
  });
});
