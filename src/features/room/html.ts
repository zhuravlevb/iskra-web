/**
 * `formatted_body` → безопасный фрагмент DOM.
 *
 * DOMPurify с белым списком тегов из спецификации Matrix (см. план, «Безопасность»), и
 * поверх — своё:
 * - `<mx-reply>` выбрасывается вместе с содержимым: это цитата-подпорка старых клиентов,
 *   цитату мы рисуем сами;
 * - ссылки — только `https:`, `http:` и `mailto:`, и всегда в новой вкладке, с
 *   `noopener noreferrer`;
 * - упоминание человека (`https://matrix.to/#/@…`) — не ссылка на чужой сайт, а имя;
 * - картинки не грузятся никогда: `mxc://` внутри HTML сам не качается (план), а чужой
 *   `https:` раскрыл бы адрес читающего. Вместо картинки — её подпись.
 *
 * Возвращается фрагмент, а не строка: в разметку он попадает `append`, и ни одна наша
 * строчка не пишет в `innerHTML`. Сам DOMPurify разбирает HTML через свою политику
 * Trusted Types `dompurify` — она есть в CSP.
 */
import DOMPurify, { type Config } from 'dompurify';

const TAGS = [
  'font', 'del', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol', 'sup', 'sub', 'li',
  'b', 'i', 'u', 'strong', 'em', 's', 'strike', 'code', 'hr', 'br', 'div', 'table', 'thead', 'tbody', 'tr',
  'th', 'td', 'caption', 'pre', 'span', 'img', 'details', 'summary',
];
const ATTRIBUTES = ['href', 'alt', 'title', 'start', 'data-mx-spoiler'];
const SAFE_LINK = /^(https?:|mailto:)/i;
const USER_MENTION = /^https:\/\/matrix\.to\/#\/(@[^/?]+)/;

const config: Config = {
  ALLOWED_TAGS: TAGS,
  ALLOWED_ATTR: ATTRIBUTES,
  ADD_FORBID_CONTENTS: ['mx-reply'],
  ALLOW_DATA_ATTR: false,
  RETURN_DOM_FRAGMENT: true,
};

let purifier: ReturnType<typeof DOMPurify> | undefined;

function instance(window: Window): ReturnType<typeof DOMPurify> {
  if (purifier) return purifier;
  const created = DOMPurify(window as never);
  created.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (!SAFE_LINK.test(href)) node.removeAttribute('href');
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  purifier = created;
  return created;
}

/** Чистый фрагмент для вставки. `window` — для тестов под jsdom. */
export function sanitizeMatrixHtml(html: string, win: Window = window): DocumentFragment {
  const fragment = instance(win).sanitize(html, config) as unknown as DocumentFragment;
  const doc = fragment.ownerDocument;

  for (const img of [...fragment.querySelectorAll('img')]) {
    const label = img.getAttribute('alt') || img.getAttribute('title') || '';
    img.replaceWith(label ? doc.createTextNode(`[${label}]`) : doc.createTextNode(''));
  }
  for (const link of [...fragment.querySelectorAll('a')]) {
    const mention = USER_MENTION.exec(link.getAttribute('href') ?? '');
    if (!mention) continue;
    const pill = doc.createElement('span');
    pill.className = 'mention';
    pill.textContent = link.textContent || decodeURIComponent(mention[1]!);
    link.replaceWith(pill);
  }
  for (const spoiler of [...fragment.querySelectorAll('[data-mx-spoiler]')]) spoiler.classList.add('spoiler');
  return fragment;
}

/** Действие Svelte: вставить очищенный HTML, заменяя прежний. */
export function matrixHtml(node: HTMLElement, html: string) {
  const render = (value: string) => node.replaceChildren(sanitizeMatrixHtml(value));
  render(html);
  return { update: render };
}
