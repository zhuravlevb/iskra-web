import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'svelte/compiler';
import ru from '../../src/i18n/ru.json';
import en from '../../src/i18n/en.json';
import { preferredLocale, translate, translatePlural } from '../../src/i18n/index.svelte.ts';

const isPlural = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' && value !== null;

describe('переводы', () => {
  it('русский и английский — одинаковый набор ключей, ни один не запасной', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });

  it('у каждой русской плюральной строки есть one, few, many, other', () => {
    for (const [key, value] of Object.entries(ru)) {
      if (!isPlural(value)) continue;
      expect(Object.keys(value).sort(), key).toEqual(['few', 'many', 'one', 'other']);
    }
  });

  it('у каждой английской плюральной строки есть one и other', () => {
    for (const [key, value] of Object.entries(en)) {
      if (!isPlural(value)) continue;
      expect(Object.keys(value).sort(), key).toEqual(['one', 'other']);
    }
  });

  it('строка и плюраль не меняются местами между языками', () => {
    for (const key of Object.keys(ru) as Array<keyof typeof ru>) {
      expect(isPlural(en[key]), key).toBe(isPlural(ru[key]));
    }
  });

  it('подстановки одни и те же в обоих языках', () => {
    const placeholders = (value: unknown) =>
      [...JSON.stringify(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(ru) as Array<keyof typeof ru>) {
      expect(new Set(placeholders(en[key])), key).toEqual(new Set(placeholders(ru[key])));
    }
  });

  it('русские плюрали склоняются', () => {
    const forms = [1, 2, 5, 11, 21, 22, 25].map((n) => translatePlural('ru', 'roomList.mentions', n));
    expect(forms).toEqual([
      '1 упоминание вас',
      '2 упоминания вас',
      '5 упоминаний вас',
      '11 упоминаний вас',
      '21 упоминание вас',
      '22 упоминания вас',
      '25 упоминаний вас',
    ]);
  });

  it('язык — первый из navigator.languages, который у нас есть', () => {
    expect(preferredLocale(['de-DE', 'ru-RU', 'en'])).toBe('ru');
    expect(preferredLocale(['en-GB'])).toBe('en');
    expect(preferredLocale(['fr'])).toBe('en');
    expect(preferredLocale([])).toBe('en');
    expect(translate('en', 'roomList.title')).toBe('Chats');
  });
});

/**
 * Ни одной пользовательской строки в `.svelte`-разметке — только вызовы сообщений.
 * Голый текст в шаблоне и статические `aria-label`, `title`, `placeholder`, `alt` —
 * ошибка. Пунктуация и пробелы — не текст.
 */
describe('голый текст в шаблонах', () => {
  const USER_FACING_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'aria-description']);
  const hasLetters = (text: string) => /\p{L}/u.test(text);

  function svelteFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return svelteFiles(path);
      return path.endsWith('.svelte') ? [path] : [];
    });
  }

  function findRawText(source: string): string[] {
    const ast = parse(source, { modern: true });
    const found: string[] = [];
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      const n = node as Record<string, unknown>;
      if (n['type'] === 'Text' && typeof n['data'] === 'string' && hasLetters(n['data'])) {
        found.push(n['data'].trim());
      }
      if (n['type'] === 'Attribute' && USER_FACING_ATTRIBUTES.has(n['name'] as string)) {
        const value = n['value'];
        const parts = Array.isArray(value) ? value : [];
        for (const part of parts as Array<Record<string, unknown>>) {
          if (part['type'] === 'Text' && hasLetters(String(part['data']))) {
            found.push(`${n['name']}="${String(part['data'])}"`);
          }
        }
      }
      // Значения прочих атрибутов (`class="bar"`, `name="back"`) — не текст для людей.
      if (n['type'] === 'Attribute' || n['type'] === 'StyleDirective') return;
      for (const [key, child] of Object.entries(n)) {
        // Скрипты и стили — не разметка; комментарии — для людей, читающих код.
        if (key === 'instance' || key === 'module' || key === 'css') continue;
        if (n['type'] === 'Comment') continue;
        visit(child);
      }
    };
    visit(ast.fragment);
    return found;
  }

  it('детектор ловит голый текст и голую подпись', () => {
    expect(findRawText('<p>Привет</p><button aria-label="Close">×</button>')).toEqual([
      'Привет',
      'aria-label="Close"',
    ]);
    expect(findRawText('<p>{t("x")}</p><!-- комментарий --> <b> · </b>')).toEqual([]);
  });

  for (const file of svelteFiles(join(__dirname, '../../src'))) {
    it(file.replace(/^.*\/src\//, 'src/'), () => {
      expect(findRawText(readFileSync(file, 'utf8'))).toEqual([]);
    });
  }
});
