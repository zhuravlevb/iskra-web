/**
 * Лента как строки: разделители дней и сообщения, собранные в серии.
 *
 * Серия — подряд от одного человека, не дальше пяти минут друг от друга (`runWindow`
 * нативной Искры), в пределах одного дня и не через служебную строку. Внутри серии
 * имя и лицо не повторяются, а зазор тоньше сетки.
 */
import { isService, type Message } from './message';

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

export function layout(messages: readonly Message[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let previous: Message | undefined;
  let lastMessageItem: Extract<TimelineItem, { kind: 'message' }> | undefined;
  for (const message of messages) {
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
