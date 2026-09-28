/**
 * Где аккаунт и как туда войти.
 *
 * Порядок тот же, что у нативной Искры: сначала адрес сервера, потом то, что сервер умеет.
 * Человеку не показываем ни слова «homeserver»: он вводит «где аккаунт» — `matrix.org`,
 * `@me:example.org` или полный адрес, — а мы находим сервер сами.
 */
import { createClient, type ValidatedAuthMetadata } from 'matrix-js-sdk';
import { DEMO_BASE_URL, DEMO_SERVER } from '../demo/fixtures';
import { demoServer } from '../demo/instance';
import { quietLogger } from '../support/logger';

export type SignInProblem =
  | 'notFound'
  | 'unreachable'
  | 'unsupportedMethod'
  | 'badCredentials'
  | 'ssoIncomplete'
  | 'storageUnavailable';

/** Ошибка входа, уже разложенная по тому, что сказать человеку. */
export class SignInError extends Error {
  constructor(
    readonly problem: SignInProblem,
    options?: { cause?: unknown },
  ) {
    super(problem, options);
    this.name = 'SignInError';
  }
}

export interface ServerInfo {
  baseUrl: string;
  /** Демо-сервер внутри приложения — ни одного запроса в сеть. */
  demo: boolean;
  /** Имя пользователя, если человек ввёл `@name:server`. */
  username?: string;
  /** OAuth 2.0 (MAS) — основной путь. */
  oauth?: ValidatedAuthMetadata;
  /** Legacy SSO: `m.login.sso` и возврат с `loginToken`. */
  sso: boolean;
  password: boolean;
  /** Сервер умеет регистрацию через тот же поток с `prompt=create`. */
  canRegister: boolean;
}

export function fetchFor(demo: boolean): typeof globalThis.fetch {
  return demo ? demoServer().fetch : globalThis.fetch.bind(globalThis);
}

export interface ParsedAddress {
  /** Готовый адрес сервера — если ввели URL; иначе ищем через .well-known. */
  baseUrl?: string;
  /** Домен для .well-known. */
  domain?: string;
  username?: string;
  demo: boolean;
}

/**
 * Разбирает то, что человек ввёл в поле «Адрес аккаунта».
 * Не бросает — пустое или бессмысленное возвращает `null`.
 */
export function parseAddress(input: string, allowShortDemo = false): ParsedAddress | null {
  let text = input.trim();
  if (!text) return null;

  if (text === DEMO_SERVER || text === DEMO_BASE_URL || (allowShortDemo && text.toLowerCase() === 'demo')) {
    return { baseUrl: DEMO_BASE_URL, demo: true };
  }

  let username: string | undefined;
  const mxid = /^@([^:\s]+):(\S+)$/.exec(text);
  if (mxid) {
    username = mxid[1];
    text = mxid[2]!;
  }

  if (/^https?:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    // http — только для своего компьютера: локальный Synapse при разработке.
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol === 'http:' && !local) return null;
    const baseUrl = `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    return { baseUrl, demo: false, ...(username ? { username } : {}) };
  }

  const domain = text.toLowerCase().replace(/\/+$/, '');
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(domain) || !domain.includes('.') && !domain.startsWith('localhost')) {
    return null;
  }
  return { domain, demo: false, ...(username ? { username } : {}) };
}

/** `.well-known/matrix/client` → адрес сервера; нет файла — сам домен. */
async function resolveDomain(domain: string, fetchFn: typeof fetch): Promise<string> {
  const fallback = `https://${domain}`;
  let response: Response;
  try {
    response = await fetchFn(`https://${domain}/.well-known/matrix/client`, { redirect: 'follow' });
  } catch {
    // Нет .well-known — не беда; нет самого домена — узнаем на /versions.
    return fallback;
  }
  if (!response.ok) return fallback;
  try {
    const body = (await response.json()) as { 'm.homeserver'?: { base_url?: unknown } };
    const base = body['m.homeserver']?.base_url;
    if (typeof base !== 'string') return fallback;
    const url = new URL(base);
    if (url.protocol !== 'https:') return fallback;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return fallback;
  }
}

/** Находит сервер по адресу и узнаёт, как на него входят. */
export async function discoverServer(input: string, allowShortDemo = false): Promise<ServerInfo> {
  const parsed = parseAddress(input, allowShortDemo);
  if (!parsed) throw new SignInError('notFound');
  const fetchFn = fetchFor(parsed.demo);

  const baseUrl = parsed.baseUrl ?? (await resolveDomain(parsed.domain!, fetchFn));
  const client = createClient({ baseUrl, fetchFn, logger: quietLogger() });

  try {
    await client.getVersions();
  } catch (error) {
    // Сеть не ответила вовсе — «не удалось связаться»; ответила, но не Matrix — «не нашли».
    throw new SignInError(isNetworkFailure(error) ? 'unreachable' : 'notFound', { cause: error });
  }

  let oauth: ValidatedAuthMetadata | undefined;
  try {
    oauth = await client.getAuthMetadata();
  } catch {
    oauth = undefined;
  }

  let flows: string[];
  try {
    flows = (await client.loginFlows()).flows.map((flow) => flow.type);
  } catch {
    flows = [];
  }

  const info: ServerInfo = {
    baseUrl,
    demo: parsed.demo,
    ...(parsed.username ? { username: parsed.username } : {}),
    ...(oauth ? { oauth } : {}),
    sso: flows.includes('m.login.sso') && flows.includes('m.login.token'),
    password: flows.includes('m.login.password'),
    canRegister: !!oauth?.prompt_values_supported?.includes('create'),
  };
  if (!info.oauth && !info.sso && !info.password) throw new SignInError('unsupportedMethod');
  return info;
}

function isNetworkFailure(error: unknown): boolean {
  // fetch бросает TypeError, когда ответа нет совсем; SDK заворачивает это в ConnectionError.
  const name = (error as { name?: string } | null)?.name;
  return error instanceof TypeError || name === 'ConnectionError' || name === 'TypeError';
}
