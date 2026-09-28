/**
 * Ссылки в простом тексте — кусками, а не HTML-строкой: текст остаётся текстом, ссылка
 * становится `<a>`, и ни одна строчка не проходит через `innerHTML`.
 *
 * Ссылкой считается только `http(s)://…` и `www.…`. Точка, запятая, скобка в конце —
 * пунктуация предложения, а не часть адреса (кроме закрывающей скобки, у которой есть пара
 * внутри: `https://ru.wikipedia.org/wiki/Искра_(значения)`).
 */
export type Segment = { text: string; href?: string };

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'«»]+/giu;
const TRAILING_CHAR = /[.,;:!?…»"'\]]$/u;

export function linkify(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    let url = match[0];
    const start = match.index!;
    // Пунктуация в конце — предложения, а не адреса; `)` — тоже, если ей нет пары внутри.
    const count = (ch: string) => url.split(ch).length - 1;
    while (TRAILING_CHAR.test(url) || (url.endsWith(')') && count(')') > count('('))) url = url.slice(0, -1);
    if (!url.replace(/^(https?:\/\/|www\.)/i, '').includes('.') && !/^https?:\/\/localhost/i.test(url)) continue;
    if (start > last) segments.push({ text: text.slice(last, start) });
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    segments.push({ text: url, href });
    last = start + url.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}
