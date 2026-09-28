import { sessionDemoStorage } from './account';
import { DemoHomeserver } from './server';

let instance: DemoHomeserver | undefined;

/**
 * Один демо-сервер на страницу: вход и сессия должны видеть одно и то же состояние.
 * Перезагрузка страницы — новый сервер с тем же миром: переписка строится из фикстур
 * заново, а аккаунт (устройства, ключи, резервная копия) живёт в `sessionStorage` вкладки.
 */
export function demoServer(): DemoHomeserver {
  instance ??= new DemoHomeserver({ storage: sessionDemoStorage() });
  return instance;
}
