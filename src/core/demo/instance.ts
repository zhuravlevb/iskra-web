import { DemoHomeserver } from './server';

let instance: DemoHomeserver | undefined;

/**
 * Один демо-сервер на страницу: вход и сессия должны видеть одно и то же состояние.
 * Перезагрузка страницы — новый сервер с тем же миром: он строится из фикстур заново.
 */
export function demoServer(): DemoHomeserver {
  instance ??= new DemoHomeserver();
  return instance;
}
