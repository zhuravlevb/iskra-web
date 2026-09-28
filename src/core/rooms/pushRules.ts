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
