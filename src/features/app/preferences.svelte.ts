/**
 * Настройки этого устройства — `localStorage`.
 *
 * Только то, что не жалко потерять: акцент, тема, ширина колонок. Хранилище может
 * отсутствовать или бросать (приватное окно, заблокированные данные сайта), и
 * приложение от этого не должно ломаться — только забыть настройку.
 */
import { clampListWidth, LIST_IDEAL } from '../../design/columns';

export const accents = ['blue', 'red', 'orange', 'yellow', 'green', 'cyan', 'violet', 'mono'] as const;
export type Accent = (typeof accents)[number];
export type Appearance = 'system' | 'light' | 'dark';

const keys = {
  accent: 'appearance.accent',
  appearance: 'appearance.mode',
  listWidth: 'layout.listWidth',
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

  /** Пишет в хранилище и отражает на `<html>` всё, что изменилось. */
  persist(): () => void {
    return $effect.root(() => {
      $effect(() => write(keys.accent, this.accent));
      $effect(() => write(keys.appearance, this.appearance));
      $effect(() => write(keys.listWidth, String(this.listWidth)));
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
