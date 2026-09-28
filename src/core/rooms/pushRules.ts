/**
 * Беззвучность читается из push rules, а не угадывается по отсутствию числа (см. план).
 *
 * «Беззвучный» — так, как его пишут клиенты Matrix (Element, нативная Искра через SDK):
 * правило `override` с `rule_id` = ID комнаты, одним условием `room_id` и без действия
 * `notify`. Правило `room` без `notify` — это «только упоминания», не беззвучие.
 */
import type { IPushRules } from 'matrix-js-sdk';

export function mutedRoomIds(rules: IPushRules | undefined): Set<string> {
  const muted = new Set<string>();
  for (const rule of rules?.global?.override ?? []) {
    if (!rule.enabled) continue;
    const conditions = rule.conditions ?? [];
    const matchesOnlyThisRoom =
      conditions.length === 1 &&
      conditions[0]?.kind === 'event_match' &&
      (conditions[0] as { key?: string }).key === 'room_id' &&
      (conditions[0] as { pattern?: string }).pattern === rule.rule_id;
    if (!matchesOnlyThisRoom) continue;
    const notifies = rule.actions.some((action) => action === 'notify');
    if (!notifies) muted.add(rule.rule_id);
  }
  return muted;
}

/**
 * Как громко комната может отвлекать — три ответа, как в нативной Искре (`RoomAlerts`):
 * все сообщения, только упоминания, выключено. «Как по умолчанию» четвёртым не
 * предлагается: он неотличим от того из трёх, к которому сейчас сводится.
 */
export type RoomAlerts = 'all' | 'mentions' | 'muted';

const onlyThisRoom = (rule: { rule_id: string; conditions?: unknown[] }) => {
  const conditions = (rule.conditions ?? []) as Array<{ kind?: string; key?: string; pattern?: string }>;
  return conditions.length === 1 && conditions[0]?.kind === 'event_match' && conditions[0].key === 'room_id' && conditions[0].pattern === rule.rule_id;
};

export function roomAlerts(rules: IPushRules | undefined, roomId: string): RoomAlerts {
  const override = rules?.global?.override?.find((r) => r.rule_id === roomId && r.enabled && onlyThisRoom(r));
  if (override && !override.actions.some((a) => a === 'notify')) return 'muted';
  const room = rules?.global?.room?.find((r) => r.rule_id === roomId && r.enabled);
  if (room && !room.actions.some((a) => a === 'notify')) return 'mentions';
  return 'all';
}

/** Что записать, чтобы в силе было `alerts`: правила, которые убрать, и одно — завести. */
export function alertsRules(
  alerts: RoomAlerts,
  roomId: string,
): { remove: Array<{ kind: 'override' | 'room'; ruleId: string }>; add?: { kind: 'override' | 'room'; ruleId: string; body: Record<string, unknown> } } {
  const remove = [
    { kind: 'override' as const, ruleId: roomId },
    { kind: 'room' as const, ruleId: roomId },
  ];
  if (alerts === 'all') return { remove };
  if (alerts === 'mentions') return { remove, add: { kind: 'room', ruleId: roomId, body: { actions: [] } } };
  return {
    remove,
    add: { kind: 'override', ruleId: roomId, body: { actions: [], conditions: [{ kind: 'event_match', key: 'room_id', pattern: roomId }] } },
  };
}
