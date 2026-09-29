/**
 * Что в чате лежит, если читать его не как разговор: фото и видео, голосовые, «кружочки»,
 * файлы, ссылки — вкладки «О чате», как `RoomContentTabs` нативной Искры.
 *
 * Источник — то, что загрузила открытая лента, и больше ничего: у Matrix нет указателя
 * вложений комнаты, который можно спросить. Поэтому вкладки растут по мере того, как
 * история подгружается, а «Показать более раннее» — та же подгрузка, что у ленты.
 *
 * Новое — сверху: файл ищут вчерашний, а не самый первый. Порядок разворачивается здесь,
 * один раз, чтобы вкладки не могли разойтись в нём.
 */
import { linkify } from '../../design/linkify';
import type { Attachment, Message } from '../../core/timeline/message';

export type ContentTab = 'members' | 'media' | 'voice' | 'videoNotes' | 'files' | 'links';

/** Порядок полосы — постоянный: чат, в котором появился первый файл, не перетасует её под пальцем. */
export const contentTabs: readonly ContentTab[] = ['members', 'media', 'voice', 'videoNotes', 'files', 'links'];

export interface ContentItem {
  key: string;
  kind: 'image' | 'video' | 'videoNote' | 'voice' | 'audio' | 'file';
  attachment: Attachment;
  senderName: string;
  ts: number;
}

export interface LinkItem {
  /** Сообщение и адрес: в одном сообщении бывает несколько ссылок. */
  key: string;
  href: string;
  /** Адрес как написан. */
  text: string;
  /** Фраза, в которой ссылку прислали, — а не заголовок страницы: ходить по чужим ссылкам
   *  с адреса человека ради заголовков мы не станем. */
  context: string;
  ts: number;
}

export interface RoomContents {
  media: ContentItem[];
  voice: ContentItem[];
  videoNotes: ContentItem[];
  files: ContentItem[];
  links: LinkItem[];
}

export function roomContents(messages: readonly Message[]): RoomContents {
  const contents: RoomContents = { media: [], voice: [], videoNotes: [], files: [], links: [] };
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    const { kind } = message;
    switch (kind.type) {
      case 'image':
      case 'video':
      case 'videoNote':
      case 'voice':
      case 'audio':
      case 'file': {
        // Без байтов показывать нечего, а не ушедшее — ещё не содержимое чата.
        if (!kind.attachment.source || message.delivery.state !== 'sent') break;
        const item: ContentItem = { key: message.key, kind: kind.type, attachment: kind.attachment, senderName: message.senderName, ts: message.ts };
        const list =
          kind.type === 'image' || kind.type === 'video'
            ? contents.media
            : kind.type === 'videoNote'
              ? contents.videoNotes
              : kind.type === 'file'
                ? contents.files
                : contents.voice;
        list.push(item);
        break;
      }
      case 'text':
      case 'emote':
      case 'notice':
        for (const segment of linkify(kind.body)) {
          if (!segment.href) continue;
          contents.links.push({ key: `${message.key}|${segment.href}`, href: segment.href, text: segment.text, context: kind.body, ts: message.ts });
        }
        break;
    }
  }
  return contents;
}

/** Вкладки, за которыми что-то есть. «Участники» — только в группе: в личном чате это вы и тот, чьё имя наверху. */
export function availableTabs(contents: RoomContents, group: boolean): ContentTab[] {
  return contentTabs.filter((tab) => (tab === 'members' ? group : contents[tab].length > 0));
}
