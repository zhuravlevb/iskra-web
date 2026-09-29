/**
 * `Room` из SDK → `RoomSummary`. Чистая функция от комнаты и контекста — тесты гоняют её
 * по демо-серверу под настоящим `matrix-js-sdk`.
 */
import { EventType, KnownMembership, NotificationCountType, type Room, type RoomMember } from 'matrix-js-sdk';
import { isPreviewable, previewOf } from './preview';
import type { RoomFace, RoomKind, RoomSummary } from './types';

export interface SummaryContext {
  ownUserId: string;
  /** Из `m.direct`: комната → собеседник. */
  directRooms: Map<string, string>;
  mutedRooms: Set<string>;
  /** Заблокированные: их сообщение не становится превью. */
  blocked: Set<string>;
}

const MARKED_UNREAD = ['m.marked_unread', 'com.famedly.marked_unread'];

export function summarize(room: Room, context: SummaryContext): RoomSummary | undefined {
  const membership = room.getMyMembership();
  if (membership !== KnownMembership.Join && membership !== KnownMembership.Invite) return undefined;
  const invited = membership === KnownMembership.Invite;
  const me = context.ownUserId;

  const kind: RoomKind = room.isSpaceRoom()
    ? 'space'
    : context.directRooms.has(room.roomId) || (invited && isDirectInvite(room, me))
      ? 'direct'
      : 'group';

  const others = otherMembers(room, me);
  const partnerId = kind === 'direct' ? (context.directRooms.get(room.roomId) ?? others[0]?.userId) : undefined;
  const partner = partnerId ? room.getMember(partnerId) : null;

  // Имя и картинка личного чата — от собеседника, и падают на него вместе.
  const explicitName = stateContent(room, EventType.RoomName)?.['name'];
  const name =
    (typeof explicitName === 'string' && explicitName.trim()) ||
    room.getCanonicalAlias() ||
    (partner ? displayName(partner) : undefined) ||
    namesOf(others) ||
    undefined;

  const avatarUrl = room.getMxcAvatarUrl() ?? (kind === 'direct' ? (partner?.getMxcAvatarUrl() ?? undefined) : undefined);

  const faces: RoomFace[] =
    kind === 'group'
      ? others.slice(0, 2).map((m) => ({
          id: m.userId,
          name: displayName(m),
          ...(m.getMxcAvatarUrl() ? { avatarUrl: m.getMxcAvatarUrl()! } : {}),
        }))
      : [];

  let preview: RoomSummary['preview'];
  let lastActivity = 0;
  let lastEvent;
  const events = room.getLiveTimeline().getEvents();
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!;
    if (!isPreviewable(event)) continue;
    if (context.blocked.has(event.getSender() ?? '')) continue;
    lastEvent = event;
    preview = previewOf(event);
    lastActivity = event.getTs();
    break;
  }
  if (!lastActivity) lastActivity = room.getLastActiveTimestamp() > 0 ? room.getLastActiveTimestamp() : 0;

  // Непрочитанное без уведомлений: у беззвучного чата сервер не считает, но новое есть.
  const hasUnreadMessages =
    !invited && !!lastEvent && lastEvent.getSender() !== me && !!lastEvent.getId() && !room.hasUserReadEvent(me, lastEvent.getId()!);

  const inviter = invited ? room.getDMInviter() ?? inviterOf(room, me) : undefined;
  const inviterMember = inviter ? room.getMember(inviter) : null;

  return {
    id: room.roomId,
    ...(name ? { name } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    avatarSeed: partnerId ?? room.roomId,
    faces,
    kind,
    encrypted: room.hasEncryptionStateEvent(),
    membership: invited ? 'invite' : 'join',
    ...(inviter ? { invitedBy: inviterMember ? displayName(inviterMember) : inviter } : {}),
    unreadCount: room.getUnreadNotificationCount(NotificationCountType.Total),
    mentionCount: room.getUnreadNotificationCount(NotificationCountType.Highlight),
    hasUnreadMessages,
    isMarkedUnread: MARKED_UNREAD.some((type) => room.getAccountData(type)?.getContent()?.['unread'] === true),
    isMuted: context.mutedRooms.has(room.roomId),
    isFavourite: 'm.favourite' in room.tags,
    isLowPriority: 'm.lowpriority' in room.tags,
    ...(preview ? { preview } : {}),
    lastActivity,
  };
}

function stateContent(room: Room, type: string): Record<string, unknown> | undefined {
  return room.currentState.getStateEvents(type, '')?.getContent();
}

/** Остальные участники — вошедшие и приглашённые, по порядку ID, чтобы лица не прыгали. */
function otherMembers(room: Room, me: string): RoomMember[] {
  return room
    .getMembers()
    .filter((m) => m.userId !== me && (m.membership === KnownMembership.Join || m.membership === KnownMembership.Invite))
    .sort((a, b) => a.userId.localeCompare(b.userId));
}

function displayName(member: RoomMember): string {
  return member.rawDisplayName?.trim() || member.userId;
}

function namesOf(members: RoomMember[]): string | undefined {
  if (members.length === 0) return undefined;
  return members.slice(0, 3).map(displayName).join(', ');
}

/** Приглашение в личный чат: `is_direct` в событии приглашения. */
function isDirectInvite(room: Room, me: string): boolean {
  return room.getMember(me)?.events.member?.getContent()?.['is_direct'] === true;
}

function inviterOf(room: Room, me: string): string | undefined {
  return room.getMember(me)?.events.member?.getSender();
}

/** Комнаты пространства — из `m.space.child` с непустым `via` (пустой — ребёнка убрали). */
export function spaceChildren(space: Room): string[] {
  return space.currentState
    .getStateEvents(EventType.SpaceChild)
    .filter((event) => {
      const via = event.getContent()?.['via'];
      return Array.isArray(via) && via.length > 0;
    })
    .map((event) => event.getStateKey()!)
    .filter(Boolean);
}
