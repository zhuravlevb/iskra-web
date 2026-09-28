import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blobatar, _layout, VERSION } from 'blobatar';
import { creatureUri, initialsOf, magnification } from '../../src/design/faces';

/**
 * blobatar — это лицо человека. Тот же сид — то же существо здесь, в нативной Искре и
 * везде, где работает blobatar. Golden-файл — тот же, что держит `BlobatarTests` нативной
 * Искры (`Tests/IskraDesignTests/Resources/blobatar-gen2-golden.txt`, он же
 * `test/golden/gen2.txt` самого blobatar). Обновление пакета, которое двигает эти числа, —
 * смена лица людям, а не исправление.
 */
const golden = (() => {
  const text = readFileSync(join(__dirname, '../fixtures/blobatar-gen2-golden.txt'), 'utf8');
  const sections: Record<string, Array<[string, string]>> = {};
  let current = '';
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      current = line.slice(1, -1);
      sections[current] = [];
      continue;
    }
    const tab = line.indexOf('\t');
    if (tab > 0) sections[current]!.push([line.slice(0, tab), line.slice(tab + 1)]);
  }
  return sections;
})();

const digest = (markup: string) => createHash('sha256').update(markup).digest('hex').slice(0, 16);

/** Корпус сидов — те же шаблоны, что у фикстуры (и у `BlobatarTests.seeds`). */
const seeds = Array.from({ length: 1000 }, (_, i) => {
  switch (i % 10) {
    case 0: return `user-${i}`;
    case 1: return `alain${i}@example.com`;
    case 2: return ((i * 2654435761) >>> 0).toString(16).padStart(8, '0').repeat(4);
    case 3: return `Team Rocket ${i}`;
    case 4: return `café-${i}`;
    case 5: return `Ünïcødé ${i}`;
    case 6: return `🦊${i}🌱`;
    case 7: return `${i}`;
    case 8: return `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    default: return `  Mixed Case ${i}  `;
  }
});

describe('blobatar — то же лицо, что в нативной Искре', () => {
  it('версия поколения gen2', () => {
    expect(VERSION.split('.')[0]).toBe('2');
  });

  it('тысяча сидов байт в байт', () => {
    const expected = new Map(golden['hashes']);
    let checked = 0;
    for (const seed of seeds) {
      const want = expected.get(seed);
      if (!want) continue;
      expect(digest(blobatar(seed)), seed).toBe(want);
      checked++;
    }
    expect(checked).toBe(1000);
  });

  it('разметка каждого силуэта', () => {
    const midpoints: Record<string, number> = {
      round: 0.11, organic: 0.35, boxy: 0.54, capsule: 0.65, nub: 0.745,
      cloud: 0.825, droplet: 0.888, hexagon: 0.933, sun: 0.965, triangle: 0.99,
    };
    let checked = 0;
    for (const [label, markup] of golden['markup']!) {
      if (!label.startsWith('shape:')) continue;
      expect(blobatar('alain', { traits: { shape: midpoints[label.slice(6)]! } }), label).toBe(markup);
      checked++;
    }
    expect(checked).toBe(10);
  });

  it('гистограмма силуэтов на двадцати тысячах', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 20_000; i++) {
      const { shape } = _layout(`histogram-${i}`);
      counts[shape] = (counts[shape] ?? 0) + 1;
    }
    for (const [shape, count] of golden['histogram']!) expect(counts[shape], shape).toBe(Number(count));
  });
});

describe('лицо в аватаре', () => {
  it('увеличение — до 1.16, из центра, фигура не уходит за рамку', () => {
    for (const seed of seeds.slice(0, 200)) {
      const m = magnification(blobatar(seed));
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(1.16);
    }
  });

  it('data-URI, без запросов наружу', () => {
    const uri = creatureUri('@anya:demo.iskra.invalid');
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(uri)).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(creatureUri('@anya:demo.iskra.invalid')).toBe(uri);
  });

  it('инициалы — как в нативной Искре', () => {
    expect(initialsOf('Аня')).toBe('А');
    expect(initialsOf('Дом 14, подъезд 2')).toBe('Д1');
    expect(initialsOf('Тарас (работа)')).toBe('Т');
    expect(initialsOf('ёлка на работе')).toBe('ЁН');
    expect(initialsOf('🦊')).toBe('🦊');
    expect(initialsOf('')).toBe('');
  });
});
