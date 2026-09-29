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
/** Шрифт: Inter из своих файлов (по умолчанию) или системный. */
export const fonts = ['inter', 'system'] as const;
export type Font = (typeof fonts)[number];

/** Обои — `Wallpaper` нативной Искры: ничего, шесть градиентов, своё фото. Одни на всё приложение. */
export const wallpapers = ['none', 'sunset', 'sea', 'forest', 'dusk', 'sand', 'night', 'photo'] as const;
export type Wallpaper = (typeof wallpapers)[number];
/** Затемнение обоев: до 0.8 — дальше выбор становится чёрным экраном со слухами о картинке. */
export const MAX_DIMMING = 0.8;
/** Четверть: градиенту не нужно, фото обычно нужно, а с нуля своё фото сначала нечитаемо. */
const DEFAULT_DIMMING = 0.25;

/** Язык: как в браузере или выбранный вручную (план: «с выбором вручную в настройках»). */
export type LanguageChoice = 'system' | Locale;

const keys = {
  accent: 'appearance.accent',
  appearance: 'appearance.mode',
  listWidth: 'layout.listWidth',
  faces: 'appearance.faces',
  font: 'appearance.font',
  language: 'language',
  welcomeSeen: 'onboarding.welcomeSeen',
  wallpaper: 'appearance.wallpaper',
  wallpaperDimming: 'appearance.wallpaperDimming',
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

function dimming(value: string | null): number {
  const n = value === null ? NaN : Number(value);
  return Number.isFinite(n) ? Math.min(MAX_DIMMING, Math.max(0, n)) : DEFAULT_DIMMING;
}

class Preferences {
  accent = $state<Accent>(oneOf(read(keys.accent), accents, 'blue'));
  appearance = $state<Appearance>(oneOf(read(keys.appearance), ['system', 'light', 'dark'], 'system'));
  listWidth = $state<number>(clampListWidth(Number(read(keys.listWidth) ?? LIST_IDEAL)));
  faces = $state<FaceMode>(oneOf(read(keys.faces), faceModes, 'creatures'));
  font = $state<Font>(oneOf(read(keys.font), fonts, 'inter'));
  language = $state<LanguageChoice>(oneOf(read(keys.language), ['system', ...locales], 'system'));
  /**
   * Слайды «что такое Iskra» уже показаны на этом устройстве. Не настройка аккаунта: кто
   * вышел, чтобы сменить аккаунт, не забыл, что такое Iskra, — и слайды при выходе остаются
   * показанными (`Onboarding.welcomeSeenKey` нативной Искры).
   */
  welcomeSeen = $state<boolean>(read(keys.welcomeSeen) === '1');
  wallpaper = $state<Wallpaper>(oneOf(read(keys.wallpaper), wallpapers, 'none'));
  wallpaperDimming = $state<number>(dimming(read(keys.wallpaperDimming)));

  /** Пишет в хранилище и отражает на `<html>` всё, что изменилось. */
  persist(): () => void {
    return $effect.root(() => {
      $effect(() => write(keys.accent, this.accent));
      $effect(() => write(keys.appearance, this.appearance));
      $effect(() => write(keys.listWidth, String(this.listWidth)));
      $effect(() => write(keys.faces, this.faces));
      $effect(() => write(keys.font, this.font));
      $effect(() => write(keys.wallpaper, this.wallpaper));
      $effect(() => write(keys.wallpaperDimming, String(this.wallpaperDimming)));
      $effect(() => {
        if (this.welcomeSeen) write(keys.welcomeSeen, '1');
      });
      $effect(() => {
        write(keys.language, this.language);
        i18n.locale = this.language === 'system' ? preferredLocale(navigator.languages ?? []) : this.language;
      });
      $effect(() => {
        const root = document.documentElement;
        root.dataset.accent = this.accent;
        if (this.font === 'inter') delete root.dataset.font;
        else root.dataset.font = this.font;
        if (this.appearance === 'system') delete root.dataset.theme;
        else root.dataset.theme = this.appearance;
      });
    });
  }
}

export const preferences = new Preferences();
