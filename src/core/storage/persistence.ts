/**
 * Хранилище может исчезнуть, и в каждом браузере по-своему (см. план, «Хранение»):
 *
 * - Chrome и Edge — `persist()` без вопросов установленному PWA, вкладке — по
 *   «вовлечённости». Просим сразу после входа, молча.
 * - Firefox — `persist()` показывает человеку запрос. Спрашиваем после входа, объяснив
 *   зачем, а не молча на пустом экране.
 * - Safari во вкладке стирает всё через семь дней без визита. Тут `persist()` не
 *   поможет — поможет только «Добавить в Dock». Тихая, но постоянная плашка.
 */

export type PersistenceAdvice =
  /** Всё хорошо, или сделать ничего нельзя — молчим. */
  | 'none'
  /** Можно попросить молча (Chromium): браузер не покажет вопроса. */
  | 'ask-silently'
  /** Браузер спросит человека сам (Firefox): сначала объяснить. */
  | 'explain-then-ask'
  /** Safari во вкладке: `persist()` бесполезен, нужен Dock. */
  | 'install-to-dock';

export interface Environment {
  userAgent: string;
  /** Открыто как установленное приложение (PWA, Dock), а не во вкладке. */
  standalone: boolean;
  persisted: boolean;
  canPersist: boolean;
}

export function currentEnvironment(persisted: boolean): Environment {
  return {
    userAgent: navigator.userAgent,
    standalone:
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    persisted,
    canPersist: typeof navigator.storage?.persist === 'function',
  };
}

/** Движок — по UA: других признаков, которые бы не врали, у браузеров нет. */
export function engineOf(userAgent: string): 'chromium' | 'gecko' | 'webkit' | 'other' {
  if (/Firefox\/|FxiOS\//.test(userAgent)) return 'gecko';
  if (/Chrome\/|Chromium\/|Edg\/|CriOS\//.test(userAgent)) return 'chromium';
  if (/AppleWebKit\//.test(userAgent) && /Safari\//.test(userAgent)) return 'webkit';
  return 'other';
}

export function persistenceAdvice(env: Environment): PersistenceAdvice {
  const engine = engineOf(env.userAgent);
  if (engine === 'webkit' && !env.standalone) return 'install-to-dock';
  if (env.persisted || !env.canPersist) return 'none';
  if (engine === 'gecko') return 'explain-then-ask';
  if (engine === 'chromium') return 'ask-silently';
  return 'none';
}

export async function isPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
