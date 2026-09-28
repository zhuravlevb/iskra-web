/**
 * Что лежит на демо-сервере: люди, комнаты, переписка.
 *
 * Всё, чтобы посмотреть любой экран с чем-то на нём: личный чат с правкой, ответом и
 * реакциями, группа с опросом, беззвучный чат, приглашение и длинная комната для
 * подгрузки истории. Время — от «сейчас», чтобы «вчера» было вчера.
 */

export const DEMO_SERVER = 'demo.iskra.invalid';
export const DEMO_BASE_URL = `https://${DEMO_SERVER}`;

export const demoUsers = {
  alice: `@alice:${DEMO_SERVER}`,
  anya: `@anya:${DEMO_SERVER}`,
  boris: `@boris:${DEMO_SERVER}`,
  vera: `@vera:${DEMO_SERVER}`,
} as const;

export const demoCredentials = { user: 'alice', password: 'password' } as const;

export const demoProfiles: Record<string, { displayname: string }> = {
  [demoUsers.alice]: { displayname: 'Алиса' },
  [demoUsers.anya]: { displayname: 'Аня' },
  [demoUsers.boris]: { displayname: 'Борис' },
  [demoUsers.vera]: { displayname: 'Вера' },
};

export const demoRooms = {
  anya: `!anya:${DEMO_SERVER}`,
  weekend: `!weekend:${DEMO_SERVER}`,
  quiet: `!quiet:${DEMO_SERVER}`,
  history: `!history:${DEMO_SERVER}`,
  invite: `!bookclub:${DEMO_SERVER}`,
} as const;

export interface DemoEvent {
  event_id?: string;
  type: string;
  sender: string;
  content: Record<string, unknown>;
  state_key?: string;
  origin_server_ts?: number;
  unsigned?: Record<string, unknown>;
}

export interface DemoRoom {
  roomId: string;
  state: DemoEvent[];
  /** Вся история по порядку; в синхронизацию уходит хвост, остальное — через /messages. */
  timeline: DemoEvent[];
  unread?: { notifications: number; highlights: number };
}

export interface DemoInvite {
  roomId: string;
  inviteState: DemoEvent[];
}

const MINUTE = 60_000;

function member(roomId: string, userId: string, membership = 'join'): DemoEvent {
  return {
    type: 'm.room.member',
    sender: userId,
    state_key: userId,
    content: { membership, displayname: demoProfiles[userId]?.displayname },
    event_id: `$member-${userId}-${roomId}`,
  };
}

function roomState(roomId: string, creator: string, members: string[], extra: DemoEvent[] = []): DemoEvent[] {
  return [
    {
      type: 'm.room.create',
      sender: creator,
      state_key: '',
      content: { creator, room_version: '10' },
      event_id: `$create-${roomId}`,
    },
    ...members.map((m) => member(roomId, m)),
    {
      type: 'm.room.power_levels',
      sender: creator,
      state_key: '',
      content: { users: { [creator]: 100 }, users_default: 0, events_default: 0, state_default: 50 },
      event_id: `$power-${roomId}`,
    },
    ...extra,
  ];
}

function text(sender: string, body: string, extra: Record<string, unknown> = {}): DemoEvent {
  return { type: 'm.room.message', sender, content: { msgtype: 'm.text', body, ...extra } };
}

/** Проставляет ID и время: последнее событие — `endsMinutesAgo` минут назад, шаг — `step` минут. */
function stamp(roomId: string, events: DemoEvent[], now: number, endsMinutesAgo: number, step = 1): DemoEvent[] {
  const slug = roomId.slice(1, roomId.indexOf(':'));
  return events.map((event, index) => ({
    ...event,
    event_id: event.event_id ?? `$${slug}-${index}`,
    origin_server_ts: now - (endsMinutesAgo + (events.length - 1 - index) * step) * MINUTE,
  }));
}

export function buildDemoWorld(now: number): { rooms: DemoRoom[]; invites: DemoInvite[] } {
  const { alice, anya, boris, vera } = demoUsers;

  const anyaRoom = demoRooms.anya;
  const anyaTimeline = stamp(
    anyaRoom,
    [
      text(anya, 'Привет! Ты в субботу свободна?'),
      text(alice, 'Привет! Вроде да, а что?'),
      text(anya, 'Хотим за город, на озеро. Поедешь?'),
      {
        type: 'm.reaction',
        sender: alice,
        content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: `$anya-2`, key: '🔥' } },
      },
      text(alice, 'Поеду! Во сколько?', {
        'm.relates_to': { 'm.in_reply_to': { event_id: `$anya-2` } },
      }),
      text(anya, 'В девять у метро'),
      text(anya, '* В десять у метро', {
        'm.new_content': { msgtype: 'm.text', body: 'В десять у метро' },
        'm.relates_to': { rel_type: 'm.replace', event_id: `$anya-5` },
      }),
      text(anya, 'Возьми плед, там ветрено'),
    ],
    now,
    3,
    2,
  );

  const weekend = demoRooms.weekend;
  const weekendTimeline = stamp(
    weekend,
    [
      text(boris, 'Кто что берёт на пикник?'),
      text(vera, 'Я — пирог'),
      {
        type: 'm.poll.start',
        sender: boris,
        content: {
          'm.poll': {
            kind: 'm.disclosed',
            max_selections: 1,
            question: { 'm.text': [{ body: 'Куда едем?' }] },
            answers: [
              { 'm.id': 'lake', 'm.text': [{ body: 'На озеро' }] },
              { 'm.id': 'forest', 'm.text': [{ body: 'В лес' }] },
              { 'm.id': 'home', 'm.text': [{ body: 'Никуда, дома хорошо' }] },
            ],
          },
          'm.text': [{ body: 'Куда едем?\n1. На озеро\n2. В лес\n3. Никуда, дома хорошо' }],
        },
      },
      text(vera, 'Алиса, ты с нами?', {
        format: 'org.matrix.custom.html',
        formatted_body: `<a href="https://matrix.to/#/${alice}">Алиса</a>, ты с нами?`,
        'm.mentions': { user_ids: [alice] },
      }),
    ],
    now,
    40,
    5,
  );

  const quiet = demoRooms.quiet;
  const quietTimeline = stamp(
    quiet,
    [text(boris, 'Напоминаю: собрание дома в четверг'), text(vera, 'Лифт опять не работает')],
    now,
    60 * 5,
    30,
  );

  const history = demoRooms.history;
  const historyTimeline = stamp(
    history,
    Array.from({ length: 400 }, (_, i) =>
      text(i % 3 === 0 ? alice : i % 3 === 1 ? boris : vera, `Сообщение номер ${i + 1}`),
    ),
    now,
    60 * 26,
    3,
  );

  return {
    rooms: [
      {
        roomId: anyaRoom,
        state: roomState(anyaRoom, anya, [anya, alice]),
        timeline: anyaTimeline,
        unread: { notifications: 2, highlights: 0 },
      },
      {
        roomId: weekend,
        state: roomState(weekend, boris, [boris, alice, vera], [
          { type: 'm.room.name', sender: boris, state_key: '', content: { name: 'Выходные' }, event_id: `$name-${weekend}` },
        ]),
        timeline: weekendTimeline,
        unread: { notifications: 3, highlights: 1 },
      },
      {
        roomId: quiet,
        state: roomState(quiet, boris, [boris, alice, vera], [
          { type: 'm.room.name', sender: boris, state_key: '', content: { name: 'Дом 14, подъезд 2' }, event_id: `$name-${quiet}` },
        ]),
        timeline: quietTimeline,
        unread: { notifications: 2, highlights: 0 },
      },
      {
        roomId: history,
        state: roomState(history, alice, [alice, boris, vera], [
          { type: 'm.room.name', sender: alice, state_key: '', content: { name: 'Длинная история' }, event_id: `$name-${history}` },
        ]),
        timeline: historyTimeline,
      },
    ],
    invites: [
      {
        roomId: demoRooms.invite,
        inviteState: [
          { type: 'm.room.name', sender: boris, state_key: '', content: { name: 'Книжный клуб' } },
          { type: 'm.room.member', sender: boris, state_key: boris, content: { membership: 'join', displayname: 'Борис' } },
          { type: 'm.room.member', sender: boris, state_key: alice, content: { membership: 'invite' } },
        ],
      },
    ],
  };
}

/** `m.direct` Алисы: с кем какие личные чаты. */
export const demoDirect = { [demoUsers.anya]: [demoRooms.anya] };

/** Беззвучные комнаты — правилом `override` без действий, как их пишут клиенты. */
export const demoMutedRooms = [demoRooms.quiet];
