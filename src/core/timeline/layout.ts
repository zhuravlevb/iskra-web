/**
 * Лента как строки: разделители дней и сообщения, собранные в серии.
 *
 * Серия — подряд от одного человека, не дальше пяти минут друг от друга (`runWindow`
 * нативной Искры), в пределах одного дня и не через служебную строку. Внутри серии
 * имя и лицо не повторяются, а зазор тоньше сетки.
 */
import { isService, type Message, type ServiceEvent } from './message';

export const RUN_WINDOW_MS = 5 * 60 * 1000;

export type TimelineItem =
  | { kind: 'day'; key: string; ts: number }
  | { kind: 'message'; key: string; message: Message; firstInRun: boolean; lastInRun: boolean };

function dayOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function continues(previous: Message | undefined, message: Message): boolean {
  return (
    !!previous &&
    !isService(previous) &&
    !isService(message) &&
    previous.senderId === message.senderId &&
    message.ts - previous.ts < RUN_WINDOW_MS &&
    dayOf(previous.ts) === dayOf(message.ts)
  );
}

const PEOPLE = new Set(['joined', 'left', 'invited', 'removed', 'banned']);

/**
 * Две служебные строки подряд, говорящие одно и то же про разных людей, — одна строка:
 * «Аня и Борис теперь в чате». Только одинаковое с одинаковым: «вошла» и «вышел» — два
 * разных факта. Уже названный второй раз не добавляется (вышел и вернулся за минуту).
 */
function merged(previous: Message, message: Message): Message | undefined {
  if (previous.kind.type !== 'service' || message.kind.type !== 'service') return undefined;
  const a = previous.kind.event;
  const b = message.kind.event;
  if (a.type !== b.type || !PEOPLE.has(a.type) || !('people' in a) || !('people' in b)) return undefined;
  const people = [...a.people, ...b.people.filter((p) => !a.people.includes(p))];
  return { ...previous, ts: message.ts, kind: { type: 'service', event: { type: a.type, people } as ServiceEvent } };
}

export function layout(messages: readonly Message[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let previous: Message | undefined;
  let lastMessageItem: Extract<TimelineItem, { kind: 'message' }> | undefined;
  for (const message of messages) {
    // Склеенная строка держит ключ первой: второй вошедший дописывается в строку, которая
    // уже на экране, а не заменяет её другой.
    const pooled = previous && lastMessageItem && dayOf(previous.ts) === dayOf(message.ts) ? merged(previous, message) : undefined;
    if (pooled && lastMessageItem) {
      lastMessageItem.message = pooled;
      previous = pooled;
      continue;
    }
    if (!previous || dayOf(previous.ts) !== dayOf(message.ts)) {
      items.push({ kind: 'day', key: `day-${dayOf(message.ts)}`, ts: message.ts });
    }
    const joined = continues(previous, message);
    if (lastMessageItem && !joined) lastMessageItem.lastInRun = true;
    lastMessageItem = { kind: 'message', key: message.key, message, firstInRun: !joined, lastInRun: false };
    items.push(lastMessageItem);
    previous = message;
  }
  if (lastMessageItem) lastMessageItem.lastInRun = true;
  return items;
}
