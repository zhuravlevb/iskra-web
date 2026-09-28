// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeMatrixHtml } from '../../src/features/room/html';

const render = (html: string) => {
  const host = document.createElement('div');
  host.append(sanitizeMatrixHtml(html, window));
  return host;
};

describe('formatted_body через DOMPurify', () => {
  it('разметка Matrix остаётся, скрипты и обработчики — нет', () => {
    const host = render('<p><b>жирно</b> <em>курсив</em></p><ul><li>раз</li></ul><script>alert(1)</script><p onclick="x()">клик</p><iframe src="https://x"></iframe>');
    expect(host.querySelector('b')?.textContent).toBe('жирно');
    expect(host.querySelector('li')?.textContent).toBe('раз');
    expect(host.querySelector('script, iframe')).toBeNull();
    expect(host.innerHTML).not.toContain('onclick');
    expect(host.textContent).not.toContain('alert');
  });

  it('ссылки: только https/http/mailto, всегда в новой вкладке без opener', () => {
    const host = render('<a href="https://example.org">сайт</a><a href="javascript:alert(1)">зло</a>');
    const [good, bad] = [...host.querySelectorAll('a')];
    expect(good!.getAttribute('href')).toBe('https://example.org');
    expect(good!.getAttribute('target')).toBe('_blank');
    expect(good!.getAttribute('rel')).toBe('noopener noreferrer');
    expect(bad!.hasAttribute('href')).toBe(false);
  });

  it('цитата-подпорка <mx-reply> выбрасывается вместе с содержимым', () => {
    const host = render('<mx-reply><blockquote>старое</blockquote></mx-reply>ответ');
    expect(host.textContent).toBe('ответ');
  });

  it('картинки не грузятся — вместо них подпись; упоминание — имя, а не ссылка наружу', () => {
    const host = render('<img src="mxc://x/y" alt="схема"> <a href="https://matrix.to/#/@alice:x">Алиса</a>, привет');
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('[схема]');
    expect(host.querySelector('a')).toBeNull();
    expect(host.querySelector('.mention')?.textContent).toBe('Алиса');
  });

  it('стили и цвета не проходят: CSP их всё равно не пустит, а контраст — наш', () => {
    const host = render('<span style="color:red" data-mx-color="#f00">текст</span><font color="red">ещё</font>');
    expect(host.innerHTML).not.toContain('style');
    expect(host.innerHTML).not.toContain('color');
  });
});
