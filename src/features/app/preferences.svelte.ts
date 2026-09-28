/**
 * Настройки этого устройства — `localStorage`.
 *
 * Только то, что не жалко потерять: акцент, тема, ширина колонок. Хранилище может
 * отсутствовать или бросать (приватное окно, заблокированные данные сайта), и
 * приложение от этого не должно ломаться — только забыть настройку.
 */
import { clampListWidth, LIST_IDEAL } from '../../design/columns';
import { i18n, locales, preferredLocale, type Locale } from '../../i18n/index.svelte.ts';

export const accents = ['blue', 'red', 'orange', 'yellow', 'green', 'cyan', 'violet', 'mono'] as const;
export type Accent = (typeof accents)[number];
export type Appearance = 'system' | 'light' | 'dark';
/** Лица без фото — `FaceMode` нативной Искры; по умолчанию существа, как там. */
export const faceModes = ['creatures', 'initials', 'creaturesAlways'] as const;
export type FaceMode = (typeof faceModes)[number];

/** Язык: как в браузере или выбранный вручную (план: «с выбором вручную в настройках»). */
export type LanguageChoice = 'system' | Locale;

const keys = {
  accent: 'appearance.accent',
  appearance: 'appearance.mode',
  listWidth: 'layout.listWidth',
  faces: 'appearance.faces',
  language: 'language',
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Не сохранилось — значит, не запомним. Ломать из-за этого нечего.
  }
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

class Preferences {
  accent = $state<Accent>(oneOf(read(keys.accent), accents, 'blue'));
  appearance = $state<Appearance>(oneOf(read(keys.appearance), ['system', 'light', 'dark'], 'system'));
  listWidth = $state<number>(clampListWidth(Number(read(keys.listWidth) ?? LIST_IDEAL)));
  faces = $state<FaceMode>(oneOf(read(keys.faces), faceModes, 'creatures'));
  language = $state<LanguageChoice>(oneOf(read(keys.language), ['system', ...locales], 'system'));

  /** Пишет в хранилище и отражает на `<html>` всё, что изменилось. */
  persist(): () => void {
    return $effect.root(() => {
      $effect(() => write(keys.accent, this.accent));
      $effect(() => write(keys.appearance, this.appearance));
      $effect(() => write(keys.listWidth, String(this.listWidth)));
      $effect(() => write(keys.faces, this.faces));
      $effect(() => {
        write(keys.language, this.language);
        i18n.locale = this.language === 'system' ? preferredLocale(navigator.languages ?? []) : this.language;
      });
      $effect(() => {
        const root = document.documentElement;
        root.dataset.accent = this.accent;
        if (this.appearance === 'system') delete root.dataset.theme;
        else root.dataset.theme = this.appearance;
      });
    });
  }
}

export const preferences = new Preferences();
