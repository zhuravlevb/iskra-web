import { describe, expect, it } from 'vitest';
import { MatrixEvent, type IEvent } from 'matrix-js-sdk';
import { mapEvent, stripReplyFallback, type MapperContext } from '../../src/core/timeline/mapper';
import { layout, RUN_WINDOW_MS } from '../../src/core/timeline/layout';
import type { Message } from '../../src/core/timeline/message';

const ME = '@alice:x';
const names: Record<string, string> = { [ME]: 'Алиса', '@anya:x': 'Аня', '@boris:x': 'Борис' };

function ev(json: Partial<IEvent> & { type: string }): MatrixEvent {
  return new MatrixEvent({ sender: '@anya:x', room_id: '!r:x', origin_server_ts: 1_000, event_id: `$${Math.random()}`, content: {}, ...json });
}

const byId = new Map<string, MatrixEvent>();
const context: MapperContext = {
  ownUserId: ME,
  nameOf: (id) => names[id] ?? id,
  avatarOf: () => undefined,
  eventById: (id) => byId.get(id),
  reactionsOf: () => [],
  keyOf: (e) => e.getId()!,
};

const map = (json: Partial<IEvent> & { type: string }) => mapEvent(ev(json), context);

describe('TimelineMapper', () => {
  it('текст, эмоут, уведомление', () => {
    expect(map({ type: 'm.room.message', content: { msgtype: 'm.text', body: 'Привет' } })?.kind).toEqual({ type: 'text', body: 'Привет' });
    expect(map({ type: 'm.room.message', content: { msgtype: 'm.emote', body: 'машет' } })?.kind).toEqual({ type: 'emote', body: 'машет' });
    expect(map({ type: 'm.room.message', content: { msgtype: 'm.notice', body: 'бот' } })?.kind).toEqual({ type: 'notice', body: 'бот' });
  });

  it('своё и чужое, имя отправителя', () => {
    const mine = map({ type: 'm.room.message', sender: ME, content: { msgtype: 'm.text', body: 'я' } })!;
    expect(mine).toMatchObject({ own: true, senderName: 'Алиса', delivery: { state: 'sent' } });
    expect(map({ type: 'm.room.message', content: { msgtype: 'm.text', body: 'ты' } })).toMatchObject({ own: false, senderName: 'Аня' });
  });

  it('вложения — с размерами из события: высота известна до загрузки', () => {
    const photo = map({ type: 'm.room.message', content: { msgtype: 'm.image', body: 'cat.jpg', url: 'mxc://x/1', info: { w: 800, h: 600, mimetype: 'image/jpeg', size: 1234 } } });
    expect(photo?.kind).toEqual({ type: 'image', attachment: { body: 'cat.jpg', url: 'mxc://x/1', width: 800, height: 600, mimetype: 'image/jpeg', size: 1234 } });
    const note = map({ type: 'm.room.message', content: { msgtype: 'm.video', body: 'v', info: { w: 400, h: 400, duration: 12_000 } } });
    expect(note?.kind.type).toBe('videoNote');
    const voice = map({ type: 'm.room.message', content: { msgtype: 'm.audio', body: 'a', 'org.matrix.msc3245.voice': {} } });
    expect(voice?.kind.type).toBe('voice');
    const secret = map({ type: 'm.room.message', content: { msgtype: 'm.file', body: 'doc.pdf', file: { url: 'mxc://x/2' } } });
    expect(secret?.kind).toEqual({ type: 'file', attachment: { body: 'doc.pdf', encrypted: true } });
  });

  it('правка — не строка; реакция — не строка; редакция — не строка', () => {
    expect(map({ type: 'm.room.message', content: { msgtype: 'm.text', body: '* x', 'm.new_content': { msgtype: 'm.text', body: 'x' }, 'm.relates_to': { rel_type: 'm.replace', event_id: '$a' } } })).toBeUndefined();
    expect(map({ type: 'm.reaction', content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$a', key: '👍' } } })).toBeUndefined();
    expect(map({ type: 'm.room.redaction', redacts: '$a', content: {} })).toBeUndefined();
  });

  it('удалённое сообщение — «удалено», удалённое служебное — ничего', () => {
    expect(map({ type: 'm.room.message', content: {}, unsigned: { redacted_because: { type: 'm.room.redaction' } as never } })?.kind).toEqual({ type: 'deleted' });
    expect(map({ type: 'm.room.topic', state_key: '', content: {}, unsigned: { redacted_because: { type: 'm.room.redaction' } as never } })).toBeUndefined();
  });

  it('ответ: цитата-подпорка вырезана, ссылка на оригинал сохранена', () => {
    const original = ev({ event_id: '$orig', type: 'm.room.message', sender: '@boris:x', content: { msgtype: 'm.text', body: 'Кто что берёт?\nвторая строка' } });
    byId.set('$orig', original);
    const reply = map({
      type: 'm.room.message',
      content: { msgtype: 'm.text', body: '> <@boris:x> Кто что берёт?\n\nЯ — пирог', 'm.relates_to': { 'm.in_reply_to': { event_id: '$orig' } } },
    })!;
    expect(reply.kind).toEqual({ type: 'text', body: 'Я — пирог' });
    expect(reply.replyTo).toEqual({ eventId: '$orig', senderName: 'Борис', text: 'Кто что берёт?' });
    expect(stripReplyFallback('без цитаты')).toBe('без цитаты');
  });

  it('опрос — вопрос и ответы, стабильные и msc3381-имена', () => {
    const stable = map({ type: 'm.poll.start', content: { 'm.poll': { question: { 'm.text': [{ body: 'Куда?' }] }, answers: [{ 'm.id': 'a', 'm.text': [{ body: 'Озеро' }] }] } } });
    expect(stable?.kind).toEqual({ type: 'poll', question: 'Куда?', answers: ['Озеро'] });
    const unstable = map({ type: 'org.matrix.msc3381.poll.start', content: { 'org.matrix.msc3381.poll.start': { question: { 'org.matrix.msc1767.text': 'Когда?' }, answers: [{ id: 'a', 'org.matrix.msc1767.text': 'Завтра' }] } } });
    expect(unstable?.kind).toEqual({ type: 'poll', question: 'Когда?', answers: ['Завтра'] });
  });

  it('служебные: вход, выход, исключение, смена имени; смена аватарки — ничего', () => {
    const member = (content: object, prev: object = {}, sender = '@anya:x') =>
      map({ type: 'm.room.member', state_key: '@anya:x', sender, content, unsigned: { prev_content: prev } as never })?.kind;
    expect(member({ membership: 'join', displayname: 'Аня' })).toEqual({ type: 'service', event: { type: 'joined', who: 'Аня' } });
    expect(member({ membership: 'leave' }, { membership: 'join' })).toEqual({ type: 'service', event: { type: 'left', who: 'Аня' } });
    expect(member({ membership: 'leave' }, { membership: 'join' }, '@boris:x')).toEqual({ type: 'service', event: { type: 'removed', who: 'Аня' } });
    expect(member({ membership: 'join', displayname: 'Анна' }, { membership: 'join', displayname: 'Аня' })).toEqual({ type: 'service', event: { type: 'renamedThemselves', from: 'Аня', to: 'Анна' } });
    expect(member({ membership: 'join', displayname: 'Аня', avatar_url: 'mxc://x/y' }, { membership: 'join', displayname: 'Аня' })).toBeUndefined();
    expect(map({ type: 'm.room.power_levels', state_key: '', content: {} })).toBeUndefined();
  });

  it('ещё не расшифрованное — не строка; не расшифровавшееся — «не открыть»', () => {
    expect(map({ type: 'm.room.encrypted', content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'x' } })).toBeUndefined();
  });
});

describe('серии и дни', () => {
  const msg = (key: string, senderId: string, ts: number, service = false): Message => ({
    key,
    kind: service ? { type: 'service', event: { type: 'roomCreated' } } : { type: 'text', body: key },
    senderId,
    senderName: senderId,
    own: false,
    ts,
    delivery: { state: 'sent' },
    edited: false,
    reactions: [],
  });
  const noon = new Date(2026, 8, 28, 12, 0).getTime();

  it('подряд от одного и ближе пяти минут — одна серия', () => {
    const items = layout([msg('a', 'x', noon), msg('b', 'x', noon + 60_000), msg('c', 'y', noon + 120_000), msg('d', 'y', noon + 120_000 + RUN_WINDOW_MS)]);
    const flags = items.filter((i) => i.kind === 'message').map((i) => i.kind === 'message' && `${i.key}:${+i.firstInRun}${+i.lastInRun}`);
    expect(flags).toEqual(['a:10', 'b:01', 'c:11', 'd:11']);
  });

  it('разделитель на каждый новый день, и серия через полночь рвётся', () => {
    const late = new Date(2026, 8, 28, 23, 59).getTime();
    const items = layout([msg('a', 'x', late), msg('b', 'x', late + 2 * 60_000)]);
    expect(items.map((i) => i.kind)).toEqual(['day', 'message', 'day', 'message']);
    expect(items[3]).toMatchObject({ firstInRun: true });
  });

  it('служебная строка рвёт серию', () => {
    const items = layout([msg('a', 'x', noon), msg('s', 'x', noon + 1000, true), msg('b', 'x', noon + 2000)]);
    expect(items.filter((i) => i.kind === 'message').map((i) => i.kind === 'message' && i.firstInRun)).toEqual([true, true, true]);
  });
});
