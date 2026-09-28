/**
 * Логгер для `createClient({ logger })`.
 *
 * Ничего не логируется: ни текст сообщений, ни токены, ни URL обратного вызова OAuth.
 * На десктопе DevTools открыты чаще, чем кажется, — консоль тоже лог. Поэтому
 * `trace`/`debug`/`info` молчат, а `warn`/`error` уходят в консоль — SDK пишет туда
 * сбои, а не тела запросов (в URL он сам заменяет параметры на `xxx`).
 */
import type { Logger } from 'matrix-js-sdk/lib/logger';

const silent = () => {};

export function quietLogger(): Logger {
  const logger: Logger = {
    trace: silent,
    debug: silent,
    info: silent,
    warn: (...msg: unknown[]) => console.warn(...msg),
    error: (...msg: unknown[]) => console.error(...msg),
    getChild: () => logger,
  };
  return logger;
}
