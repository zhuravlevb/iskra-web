/**
 * Горячие клавиши — одна таблица. Из неё и обработка, и справка (`?`, этап 6), и
 * подсказки в тултипах. `Ctrl` на Windows и Linux, `⌘` на macOS.
 *
 * Сочетания не перехватывают то, что заняли браузер и ОС, и не срабатывают, пока фокус
 * в поле ввода, — кроме тех, что для этого и сделаны (`inInput`).
 */

export interface Chord {
  key: string;
  /** `Ctrl` на Windows/Linux, `⌘` на macOS. */
  primary?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export type HotkeyId =
  | 'quickSwitch'
  | 'previousChat'
  | 'nextChat'
  | 'previousUnread'
  | 'nextUnread'
  | 'escape'
  | 'pageUp'
  | 'pageDown'
  | 'editLast'
  | 'attach'
  | 'settings'
  | 'help';

export interface Hotkey {
  id: HotkeyId;
  chords: Chord[];
  /** Работает и из поля ввода. */
  inInput?: boolean;
  /**
   * Обрабатывает не приложение, а поле, для которого сочетание и сделано (`↑` в пустом
   * композере). В таблице — ради справки и проверки на дубли; `match` его не отдаёт.
   */
  local?: boolean;
  /** Ещё не работает (настройки — этап 8): в справке не показываем. */
  planned?: boolean;
}

export const hotkeys: readonly Hotkey[] = [
  { id: 'quickSwitch', chords: [{ key: 'k', primary: true }], inInput: true },
  { id: 'previousChat', chords: [{ key: 'ArrowUp', alt: true }], inInput: true },
  { id: 'nextChat', chords: [{ key: 'ArrowDown', alt: true }], inInput: true },
  { id: 'previousUnread', chords: [{ key: 'ArrowUp', alt: true, shift: true }], inInput: true },
  { id: 'nextUnread', chords: [{ key: 'ArrowDown', alt: true, shift: true }], inInput: true },
  { id: 'escape', chords: [{ key: 'Escape' }], inInput: true },
  { id: 'pageUp', chords: [{ key: 'PageUp' }], inInput: true },
  { id: 'pageDown', chords: [{ key: 'PageDown' }], inInput: true },
  { id: 'editLast', chords: [{ key: 'ArrowUp' }], inInput: true, local: true },
  { id: 'attach', chords: [{ key: 'u', primary: true, shift: true }], inInput: true },
  { id: 'settings', chords: [{ key: ',', primary: true }], inInput: true, planned: true },
  { id: 'help', chords: [{ key: '?' }, { key: '/', primary: true }] },
];

/**
 * Занято браузером или ОС — трогать нельзя. `Ctrl T`, `Ctrl W`, `Ctrl L`, `Ctrl N`,
 * `Ctrl R`, `Ctrl F`, `Ctrl P`, `Ctrl S`, `Ctrl D`, `Ctrl H`, `Ctrl J`, `Ctrl Tab`…
 * и `Alt ←/→` — «назад/вперёд».
 */
export const reserved: readonly Chord[] = [
  ...'twlnrfpsdhjqoeg'.split('').map((key) => ({ key, primary: true })),
  ...'tnw'.split('').map((key) => ({ key, primary: true, shift: true })),
  { key: 'Tab', primary: true },
  { key: 'ArrowLeft', alt: true },
  { key: 'ArrowRight', alt: true },
  { key: 'F5' },
  { key: 'F11' },
  { key: 'F12' },
];

export function isMac(platform = typeof navigator === 'undefined' ? '' : navigator.platform): boolean {
  return /Mac|iPhone|iPad/.test(platform);
}

export const sameChord = (a: Chord, b: Chord): boolean =>
  a.key.toLowerCase() === b.key.toLowerCase() && !!a.primary === !!b.primary && !!a.alt === !!b.alt && !!a.shift === !!b.shift;

/** Нажатие → сочетание. `?` приходит с Shift на большинстве раскладок — Shift тогда не в счёт. */
export function chordOf(event: KeyboardEvent, mac = isMac()): Chord {
  const primary = mac ? event.metaKey : event.ctrlKey;
  const printable = event.key.length === 1 && !/[a-z0-9]/i.test(event.key);
  return {
    key: event.key,
    ...(primary ? { primary } : {}),
    ...(event.altKey ? { alt: true } : {}),
    ...(event.shiftKey && !printable ? { shift: true } : {}),
  };
}

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Какое действие просит нажатие — или `undefined`. */
export function match(event: KeyboardEvent, mac = isMac()): HotkeyId | undefined {
  // На macOS Alt + буква — это символ (⌥K = ˚), поэтому сравниваем по `code`, если надо.
  const chord = chordOf(event, mac);
  const inInput = isTextInput(event.target);
  for (const hotkey of hotkeys) {
    if (hotkey.local || hotkey.planned) continue;
    if (inInput && !hotkey.inInput) continue;
    if (hotkey.chords.some((c) => sameChord(c, chord))) return hotkey.id;
  }
  return undefined;
}

/** Как показать сочетание человеку: «Ctrl K», «⌘K», «Alt ↑», «⌥↑». */
export function describe(chord: Chord, mac = isMac()): string {
  const keyName: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Escape: 'Esc',
    PageUp: 'Page Up',
    PageDown: 'Page Down',
  };
  const key = keyName[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key);
  const parts = mac
    ? [chord.primary ? '⌘' : '', chord.alt ? '⌥' : '', chord.shift ? '⇧' : '', key]
    : [chord.primary ? 'Ctrl' : '', chord.alt ? 'Alt' : '', chord.shift ? 'Shift' : '', key];
  return mac ? parts.join('') : parts.filter(Boolean).join(' ');
}

export function describeHotkey(id: HotkeyId, mac = isMac()): string {
  const hotkey = hotkeys.find((h) => h.id === id);
  return hotkey?.chords[0] ? describe(hotkey.chords[0], mac) : '';
}
