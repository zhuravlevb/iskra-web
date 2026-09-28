import { formatRoute, parseRoute, type Route } from './route';

/**
 * Своя маршрутизация на History API — без библиотечного роутера.
 *
 * Стек того, что открыто поверх (листы, просмотрщик, меню), живёт здесь же на
 * следующих этапах: на Android системная «назад» закрывает последнее открытое,
 * на десктопе то же делает `Esc`.
 */
class Router {
  route = $state<Route>({ name: 'home' });

  constructor() {
    if (typeof window === 'undefined') return;
    this.route = parseRoute(window.location.hash);
    window.addEventListener('hashchange', () => {
      this.route = parseRoute(window.location.hash);
    });
  }

  go(route: Route): void {
    const hash = formatRoute(route);
    if (window.location.hash === hash) return;
    window.location.hash = hash;
  }
}

export const router = new Router();
