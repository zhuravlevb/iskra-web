/**
 * Переводы.
 *
 * Выбор этапа 1 (см. план, «Стек»): не Paraglide, а свой маленький модуль на JSON.
 * Требование было одно — пропущенный ключ должен быть ошибкой сборки, а не строкой
 * `signIn.title` на экране, — и TypeScript даёт его сам: ключи — это `keyof` русского
 * каталога, а английский обязан быть `Catalog` того же набора ключей. Лишние ключи
 * в английском и формы плюралей ловит тест `tests/unit/i18n.test.ts`. Ни компилятора,
 * ни плагина, ни рантайма больше этого файла.
 *
 * Русский пишется первым, английский — вторым. Тексты, общие с нативной Искрой,
 * переносятся дословно из её Localizable.strings — с тем же ключом.
 */
import ru from './ru.json';
import en from './en.json';

type Ru = typeof ru;
export type MessageKey = keyof Ru;
/** Ключи, у которых значение — формы плюраля, а не строка. */
export type PluralKey = { [K in MessageKey]: Ru[K] extends string ? never : K }[MessageKey];
export type TextKey = Exclude<MessageKey, PluralKey>;

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Catalog = { [K in MessageKey]: Ru[K] extends string ? string : PluralForms };

export const locales = ['ru', 'en'] as const;
export type Locale = (typeof locales)[number];

export const catalogs: Record<Locale, Catalog> = { ru, en };

/** Первый язык из `navigator.languages`, который у нас есть; иначе английский. */
export function preferredLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0];
    const found = locales.find((l) => l === base);
    if (found) return found;
  }
  return 'en';
}

type Params = Record<string, string | number>;

function interpolate(template: string, params: Params | undefined, locale: Locale): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole;
    return typeof value === 'number' ? value.toLocaleString(locale) : value;
  });
}

export function translate(locale: Locale, key: TextKey, params?: Params): string {
  return interpolate(catalogs[locale][key] as string, params, locale);
}

export function translatePlural(
  locale: Locale,
  key: PluralKey,
  count: number,
  params?: Params,
): string {
  const forms = catalogs[locale][key] as PluralForms;
  const rule = new Intl.PluralRules(locale).select(count);
  return interpolate(forms[rule] ?? forms.other, { count, ...params }, locale);
}

class I18n {
  locale = $state<Locale>(
    typeof navigator === 'undefined' ? 'ru' : preferredLocale(navigator.languages ?? []),
  );

  t = (key: TextKey, params?: Params): string => translate(this.locale, key, params);

  plural = (key: PluralKey, count: number, params?: Params): string =>
    translatePlural(this.locale, key, count, params);
}

export const i18n = new I18n();
export const t = i18n.t;
export const plural = i18n.plural;
