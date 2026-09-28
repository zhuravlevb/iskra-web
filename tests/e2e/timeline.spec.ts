import { expect, test, type Page } from '@playwright/test';
import { isPhone, signInToDemo, watchForProblems } from './helpers';

async function openRoom(page: Page, name: RegExp) {
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('log')).toBeVisible();
}

test('лента чата: сообщения, серии, служебные строки, реакции, правка', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const log = page.getByRole('log');
  await expect(log).toContainText('Кто что берёт на пикник?');
  await expect(log).toContainText('Алиса, ты с нами?');
  await expect(log).toContainText('Куда едем?');
  if (await page.getByRole('button', { name: 'Назад' }).isVisible()) await page.getByRole('button', { name: 'Назад' }).click();
  await openRoom(page, /^Аня/);
  await expect(page.getByRole('log')).toContainText('В десять у метро');
  await expect(page.getByRole('log')).toContainText('изменено');
  await expect(page.getByRole('list', { name: 'Реакции' })).toContainText('🔥 1');
  expect(problems).toEqual([]);
});

test('отправка: Enter на десктопе, кнопка на телефоне; сообщение одно, не два', async ({ page }, info) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const field = page.getByRole('textbox', { name: 'Сообщение' });
  await field.fill('Беру мангал');
  if (isPhone(info.project.name)) {
    await field.press('Enter');
    await expect(field).toHaveValue('Беру мангал\n');
    await field.fill('Беру мангал');
    await page.getByRole('button', { name: 'Отправить' }).click();
  } else {
    await field.press('Shift+Enter');
    await expect(field).toHaveValue('Беру мангал\n');
    await field.fill('Беру мангал');
    await field.press('Enter');
  }
  await expect(field).toHaveValue('');
  const sent = page.getByRole('log').getByText('Беру мангал', { exact: true });
  await expect(sent).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'Отправляется' })).toHaveCount(0, { timeout: 10_000 });
  await expect(sent).toHaveCount(1);
  // Превью в списке — тоже новое.
  if (!isPhone(info.project.name)) await expect(page.getByRole('link', { name: /^Выходные/ })).toContainText('Беру мангал');
});

test('не ушло — «Не отправлено» и «Отправить заново»', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Сбой отправки');
  await page.getByRole('button', { name: 'Отправить' }).click();
  const alert = page.getByRole('log').getByRole('alert');
  await expect(alert).toContainText('Не отправлено');
  await alert.getByRole('button', { name: 'Отправить заново' }).click();
  await expect(alert).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole('log').getByText('Сбой отправки', { exact: true })).toHaveCount(1);
});

test('история: окно наполняется, прокрутка вверх подгружает без прыжка', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'хватит десктопа: логика одна');
  await page.setViewportSize({ width: 1440, height: 1400 });
  await signInToDemo(page);
  await openRoom(page, /^Длинная история/);
  const scroller = page.locator('.scroller');
  // Высокое окно: ленту дозагрузили, пока её не стало можно прокрутить.
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 400)).toBe(true);
  // Внизу — последнее сообщение.
  await expect(page.getByRole('log').getByText('Сообщение номер 400', { exact: true })).toBeInViewport();

  // Вверх: запоминаем, где стоит одно сообщение, листаем к верху, ждём подгрузки.
  const count = () => page.locator('.item').count();
  const before = await count();
  await scroller.evaluate((el) => (el.scrollTop = 500));
  const marker = page.locator('.item').nth(5);
  const markerText = await marker.innerText();
  const y1 = (await marker.boundingBox())!.y;
  await scroller.evaluate((el) => (el.scrollTop = 0));
  await scroller.evaluate((el) => el.dispatchEvent(new Event('scroll')));
  await expect.poll(count).toBeGreaterThan(before);
  // Помеченное сообщение не уехало: подгрузка сверху не сдвинула то, что на экране
  // (сдвиг — ровно на 500 пикселей нашей же прокрутки к верху).
  const again = page.locator('.item').filter({ hasText: markerText }).first();
  const y2 = (await again.boundingBox())!.y;
  expect(Math.abs(y2 - (y1 + 500))).toBeLessThan(4);
});

test('ширина окна меняется — место чтения остаётся', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'десктоп');
  await signInToDemo(page);
  await openRoom(page, /^Длинная история/);
  const scroller = page.locator('.scroller');
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight > el.clientHeight * 2)).toBe(true);
  await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
  await page.waitForTimeout(100);
  const top = page.locator('.item').filter({ hasText: 'Сообщение номер' });
  const visible = await top.evaluateAll((els) => {
    const box = document.querySelector('.scroller')!.getBoundingClientRect();
    const el = els.find((e) => e.getBoundingClientRect().bottom > box.top + 1)!;
    return { text: el.textContent!.match(/Сообщение номер \d+/)![0], offset: el.getBoundingClientRect().top - box.top };
  });
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForTimeout(200);
  const after = await page.evaluate((text) => {
    const box = document.querySelector('.scroller')!.getBoundingClientRect();
    const el = [...document.querySelectorAll('.item')].find((e) => e.textContent!.includes(text + ' ') || e.textContent!.endsWith(text) || new RegExp(text + '\\D').test(e.textContent!))!;
    return el.getBoundingClientRect().top - box.top;
  }, visible.text);
  expect(Math.abs(after - visible.offset)).toBeLessThan(8);
});
