import { describe, expect, it } from 'vitest';
import type { Message, MessageKind } from '../../src/core/timeline/message';
import { availableTabs, roomContents } from '../../src/features/room/contents';

let n = 0;
function message(kind: MessageKind, extra: Partial<Message> = {}): Message {
  n++;
  return {
    key: `k${n}`,
    kind,
    senderId: '@vera:x',
    senderName: 'Вера',
    own: false,
    ts: n * 1000,
    delivery: { state: 'sent' },
    edited: false,
    reactions: [],
    pinned: false,
    canEdit: false,
    canDelete: false,
    ...extra,
  };
}
const file = (type: 'image' | 'video' | 'videoNote' | 'voice' | 'audio' | 'file', name: string, source = true): MessageKind => ({
  type,
  attachment: { name, ...(source ? { source: { mxc: `mxc://x/${name}` } } : {}) },
});

describe('вкладки «О чате»', () => {
  it('раскладывает по вкладкам, новое — сверху', () => {
    const contents = roomContents([
      message(file('image', 'первое.jpg')),
      message(file('file', 'план.pdf')),
      message(file('video', 'видео.mp4')),
      message(file('voice', 'голос.ogg')),
      message(file('audio', 'песня.mp3')),
      message(file('videoNote', 'кружок.mp4')),
    ]);
    expect(contents.media.map((i) => i.attachment.name)).toEqual(['видео.mp4', 'первое.jpg']);
    expect(contents.files.map((i) => i.attachment.name)).toEqual(['план.pdf']);
    expect(contents.voice.map((i) => i.attachment.name)).toEqual(['песня.mp3', 'голос.ogg']);
    expect(contents.videoNotes.map((i) => i.attachment.name)).toEqual(['кружок.mp4']);
  });

  it('не ушедшее и без байтов — не содержимое чата', () => {
    const contents = roomContents([message(file('image', 'летит.jpg'), { delivery: { state: 'sending' } }), message(file('file', 'битое', false))]);
    expect(contents.media).toEqual([]);
    expect(contents.files).toEqual([]);
  });

  it('ссылки: каждая своей строкой, с фразой, в которой прислана', () => {
    const body = 'Бронь тут https://example.org/a, а карта — www.example.org/map.';
    const links = roomContents([message({ type: 'text', body }), message({ type: 'text', body: 'без ссылок' })]).links;
    expect(links.map((l) => l.href)).toEqual(['https://example.org/a', 'https://www.example.org/map']);
    expect(links[0]).toMatchObject({ context: body });
    expect(new Set(links.map((l) => l.key)).size).toBe(2);
  });

  it('пустые вкладки не показываются; «Участники» — только в группе', () => {
    const contents = roomContents([message(file('file', 'план.pdf'))]);
    expect(availableTabs(contents, true)).toEqual(['members', 'files']);
    expect(availableTabs(contents, false)).toEqual(['files']);
    expect(availableTabs(roomContents([]), false)).toEqual([]);
  });
});
