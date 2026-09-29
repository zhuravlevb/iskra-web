/**
 * Три пути внутрь — в том порядке, в каком их предлагаем:
 *
 * 1. OAuth 2.0 (MAS) — основной: так входят на matrix.org сегодня. Динамическая
 *    регистрация клиента, PKCE, возврат с кодом.
 * 2. Legacy SSO — `m.login.sso`, редирект, `loginToken` на обратном пути.
 * 3. Пароль — для серверов без SSO. Один вызов `login`.
 *
 * Страница уходит на сервер и возвращается. Всё, что нужно после возврата (PKCE verifier,
 * `state`, адрес сервера), кладётся в `sessionStorage` до редиректа: он живёт ровно столько,
 * сколько вкладка, и не переживает её закрытия.
 */
import {
  createClient,
  OAuth2,
  type OAuthRegistrationRequest,
  type ValidatedAuthMetadata,
} from 'matrix-js-sdk';
import type { AuthCallback } from './callback';
import { fetchFor, SignInError, type ServerInfo } from './server';
import type { NewAccount } from '../storage/vault';
import { quietLogger } from '../support/logger';

const PENDING_KEY = 'iskra.signIn.pending';
const CLIENTS_KEY = 'iskra.oauth.clients';

type Pending =
  | { kind: 'sso'; baseUrl: string }
  | {
      kind: 'oauth';
      baseUrl: string;
      state: string;
      clientId: string;
      redirectUri: string;
      deviceId: string;
      codeVerifier: string;
      metadata: ValidatedAuthMetadata;
    };

/**
 * Куда сервер вернёт человека: корень приложения — с базовым путём сборки (на GitHub Pages
 * это `/iskra-web/`). Параметры стираются в `callback.ts`.
 */
export function redirectUri(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

/** Метаданные клиента для динамической регистрации. Нужен настоящий https-домен. */
export function clientMetadata(origin: string): OAuthRegistrationRequest {
  return {
    client_name: 'Iskra',
    client_uri: `${origin}${import.meta.env.BASE_URL}`,
    application_type: 'web',
    redirect_uris: [`${origin}${import.meta.env.BASE_URL}`],
    logo_uri: `${origin}${import.meta.env.BASE_URL}icons/icon-512.png`,
  };
}

function savePending(pending: Pending): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

/** Забирает ожидание возврата — один раз: повторный возврат с тем же кодом не пройдёт. */
function takePending(): Pending | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Pending;
  } catch {
    return null;
  }
}

function randomToken(bytes = 16): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ————— Пароль —————

export async function signInWithPassword(server: ServerInfo, username: string, password: string): Promise<NewAccount> {
  const client = createClient({ baseUrl: server.baseUrl, fetchFn: fetchFor(server.demo), logger: quietLogger() });
  const user = username.trim().replace(/^@/, '');
  try {
    const login = await client.loginRequest({
      type: 'm.login.password',
      identifier: user.includes(':') ? { type: 'm.id.user', user: `@${user}` } : { type: 'm.id.user', user },
      password,
      initial_device_display_name: deviceDisplayName(),
    });
    return {
      userId: login.user_id,
      deviceId: login.device_id,
      homeserverUrl: login.well_known?.['m.homeserver']?.base_url?.replace(/\/+$/, '') ?? server.baseUrl,
      method: server.demo ? 'demo' : 'password',
      accessToken: login.access_token,
      ...(login.refresh_token ? { refreshToken: login.refresh_token } : {}),
    };
  } catch (error) {
    const code = (error as { errcode?: string }).errcode;
    if (code === 'M_FORBIDDEN' || code === 'M_INVALID_USERNAME' || code === 'M_USER_DEACTIVATED') {
      throw new SignInError('badCredentials', { cause: error });
    }
    throw new SignInError('unreachable', { cause: error });
  }
}

// ————— Legacy SSO —————

/** Адрес, куда увести страницу. Сам уход — `location.assign` у вызывающего. */
export function startSso(server: ServerInfo): string {
  const client = createClient({ baseUrl: server.baseUrl, logger: quietLogger() });
  savePending({ kind: 'sso', baseUrl: server.baseUrl });
  return client.getSsoLoginUrl(redirectUri(), 'sso');
}

// ————— OAuth 2.0 —————

function cachedClientId(issuer: string, redirect: string): string | undefined {
  try {
    const all = JSON.parse(localStorage.getItem(CLIENTS_KEY) ?? '{}') as Record<string, { clientId: string; redirectUri: string }>;
    const hit = all[issuer];
    return hit?.redirectUri === redirect ? hit.clientId : undefined;
  } catch {
    return undefined;
  }
}

function rememberClientId(issuer: string, redirect: string, clientId: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(CLIENTS_KEY) ?? '{}') as Record<string, unknown>;
    all[issuer] = { clientId, redirectUri: redirect };
    localStorage.setItem(CLIENTS_KEY, JSON.stringify(all));
  } catch {
    // Не запомнили — зарегистрируемся снова в следующий раз.
  }
}

/**
 * Готовит вход через OAuth и возвращает адрес страницы сервера.
 * `create` — регистрация нового аккаунта тем же потоком.
 */
export async function startOAuth(server: ServerInfo, options: { create?: boolean } = {}): Promise<string> {
  const metadata = server.oauth;
  if (!metadata) throw new SignInError('unsupportedMethod');
  const redirect = redirectUri();
  const logger = quietLogger();

  let clientId = cachedClientId(metadata.issuer, redirect);
  if (!clientId) {
    try {
      clientId = await OAuth2.registerClient(metadata, clientMetadata(window.location.origin), logger);
    } catch (error) {
      // Сервер не пустил нас зарегистрироваться — для человека это «не поддерживается».
      throw new SignInError('unsupportedMethod', { cause: error });
    }
    rememberClientId(metadata.issuer, redirect, clientId);
  }

  // Своё имя устройства — как у всех Matrix-клиентов, латиница и цифры.
  const deviceId = randomToken(5).toUpperCase();
  const oauth = new OAuth2(metadata, { clientId, redirectUri: redirect, deviceId }, logger);
  const state = randomToken();
  const url = await oauth.generateAuthorizationCodeGrantUrl(state, 'fragment', options.create ? 'create' : undefined);
  savePending({
    kind: 'oauth',
    baseUrl: server.baseUrl,
    state,
    clientId,
    redirectUri: redirect,
    deviceId,
    codeVerifier: oauth.context.codeVerifier,
    metadata,
  });
  return url;
}

// ————— Возврат —————

/** Завершает вход, начатый до редиректа. Любая неудача — «вход не завершился». */
export async function completeSignIn(callback: AuthCallback): Promise<NewAccount> {
  const pending = takePending();
  if (!pending) throw new SignInError('ssoIncomplete');

  if (callback.kind === 'sso' && pending.kind === 'sso') {
    const client = createClient({ baseUrl: pending.baseUrl, logger: quietLogger() });
    try {
      const login = await client.loginRequest({
        type: 'm.login.token',
        token: callback.loginToken,
        initial_device_display_name: deviceDisplayName(),
      });
      return {
        userId: login.user_id,
        deviceId: login.device_id,
        homeserverUrl: pending.baseUrl,
        method: 'sso',
        accessToken: login.access_token,
        ...(login.refresh_token ? { refreshToken: login.refresh_token } : {}),
      };
    } catch (error) {
      throw new SignInError('ssoIncomplete', { cause: error });
    }
  }

  if (callback.kind === 'oauth' && pending.kind === 'oauth') {
    // `state` не совпал — это не наш возврат (или подделка). Код не трогаем.
    if (callback.state !== pending.state) throw new SignInError('ssoIncomplete');
    const logger = quietLogger();
    const oauth = new OAuth2(
      pending.metadata,
      {
        clientId: pending.clientId,
        redirectUri: pending.redirectUri,
        deviceId: pending.deviceId,
        codeVerifier: pending.codeVerifier,
      },
      logger,
    );
    try {
      const tokens = await oauth.completeAuthorizationCodeGrant(callback.code);
      const client = createClient({ baseUrl: pending.baseUrl, accessToken: tokens.access_token, logger });
      const whoami = await client.whoami();
      return {
        userId: whoami.user_id,
        deviceId: whoami.device_id ?? pending.deviceId,
        homeserverUrl: pending.baseUrl,
        method: 'oauth',
        accessToken: tokens.access_token,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        oauth: {
          clientId: pending.clientId,
          redirectUri: pending.redirectUri,
          metadata: pending.metadata as unknown as Record<string, unknown>,
        },
      };
    } catch (error) {
      throw new SignInError('ssoIncomplete', { cause: error });
    }
  }

  throw new SignInError('ssoIncomplete');
}

/** Как устройство называется в списке сеансов: «Iskra Web — Chrome на Windows». */
export function deviceDisplayName(userAgent = navigator.userAgent): string {
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  const os = /Android/.test(userAgent)
    ? 'Android'
    : /Windows/.test(userAgent)
      ? 'Windows'
      : /CrOS/.test(userAgent)
        ? 'ChromeOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  const where = [browser, os].filter(Boolean).join(', ');
  return where ? `Iskra Web (${where})` : 'Iskra Web';
}
