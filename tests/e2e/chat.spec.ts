import { expect, test, type Page } from '@playwright/test';
import { isPhone, signInToDemo, watchForProblems } from './helpers';

async function openRoom(page: Page, name: RegExp) {
  // На телефоне открытый чат занимает весь экран — сначала назад, к списку.
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('log')).toBeVisible();
}

const bubble = (page: Page, text: string) => page.getByRole('log').getByRole('article').filter({ hasText: text });

/** Меню сообщения — правым щелчком (пальцем это долгое нажатие, браузер шлёт тот же `contextmenu`). */
async function menuOf(page: Page, text: string) {
  await bubble(page, text).click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Ещё' });
  await expect(menu).toBeVisible();
  return menu;
}

test('меню сообщения: реакция ставится из меню и снимается нажатием на неё', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const menu = await menuOf(page, 'Я — пирог');
  await expect(menu).toContainText(/Отправлено \d{1,2}:\d{2}/);
  // Чужое: ответить и скопировать — да; изменить и удалить — нет.
  await expect(menu.getByRole('menuitem', { name: 'Ответить' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Изменить' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Удалить' })).toHaveCount(0);
  await menu.getByRole('menuitemcheckbox', { name: 'Реакция 👍' }).click();
  await expect(menu).toBeHidden();

  const chip = page.getByRole('list', { name: 'Реакции' }).getByRole('button', { name: '👍 1' });
  await expect(chip).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  // Снять — нажать на свою же. Дождаться, пока она уйдёт на сервер: снимают её, а не эхо.
  await expect(page.getByRole('img', { name: 'Отправляется' })).toHaveCount(0);
  await chip.click();
  await expect(chip).toHaveCount(0, { timeout: 10_000 });
  expect(problems).toEqual([]);
});

test('ответ и правка: полоса над полем, ↑ берёт последнее своё, Esc отменяет', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const field = page.getByRole('textbox', { name: 'Сообщение' });

  await (await menuOf(page, 'Я — пирог')).getByRole('menuitem', { name: 'Ответить' }).click();
  await expect(page.getByText('Ответ', { exact: true })).toBeVisible();
  await expect(field).toBeFocused();
  await field.press('Escape');
  await expect(page.getByText('Ответ', { exact: true })).toBeHidden();

  await (await menuOf(page, 'Я — пирог')).getByRole('menuitem', { name: 'Ответить' }).click();
  await field.fill('А я — мангал');
  await page.getByRole('button', { name: 'Отправить' }).click();
  const reply = bubble(page, 'А я — мангал');
  // Цитата — внутри ответа: кто и что.
  await expect(reply).toContainText('Вера');
  await expect(reply).toContainText('Я — пирог');
  await expect(page.getByText('Ответ', { exact: true })).toBeHidden();
  await expect(page.getByRole('img', { name: 'Отправляется' })).toHaveCount(0, { timeout: 10_000 });

  // ↑ в пустом поле — правка последнего своего.
  await field.click();
  await field.press('ArrowUp');
  await expect(page.getByText('Изменение сообщения')).toBeVisible();
  await expect(field).toHaveValue('А я — мангал');
  await field.fill('А я — мангал и угли');
  await page.getByRole('button', { name: 'Отправить' }).click();
  // «изменено» — рядом с пузырём, в колонке отметок, как в нативной Искре.
  await expect(page.getByRole('log').locator('.row').filter({ hasText: 'А я — мангал и угли' })).toContainText('изменено', { timeout: 10_000 });
  await expect(field).toHaveValue('');
});

test('удаление своего — с вопросом, и исчезает у всех', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const field = page.getByRole('textbox', { name: 'Сообщение' });
  await field.fill('Ой, не в тот чат');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByRole('img', { name: 'Отправляется' })).toHaveCount(0, { timeout: 10_000 });

  await (await menuOf(page, 'Ой, не в тот чат')).getByRole('menuitem', { name: 'Удалить' }).click();
  const dialog = page.getByRole('dialog', { name: 'Удалить сообщение?' });
  await expect(dialog).toContainText('исчезнет у всех');
  await dialog.getByRole('button', { name: 'Удалить' }).click();
  await expect(bubble(page, 'Ой, не в тот чат')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole('log')).toContainText('Сообщение удалено');
});

test('опрос: голос Веры уже есть, мой добавляется — и видны итоги', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const poll = bubble(page, 'Куда едем?');
  await expect(poll).toContainText('Проголосовал 1 человек');
  await poll.getByRole('radio', { name: /^В лес/ }).click();
  await expect(poll.getByRole('radio', { name: /^В лес/ })).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
  await expect(poll).toContainText('Проголосовали 2 человека');
  await expect(poll.getByRole('radio', { name: /^На озеро/ })).toContainText('1 голос');
});

test('закреплённое: полоса над лентой, нажатие ведёт к сообщению', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const strip = page.getByRole('button', { name: 'Перейти к закреплённому' });
  await expect(strip).toContainText('Кто что берёт на пикник?');
  await page.getByRole('log').evaluate((log) => log.parentElement!.scrollTo({ top: 0 }));
  await strip.click();
  await expect(bubble(page, 'Кто что берёт на пикник?')).toBeInViewport();
  // Алиса здесь не админ: открепить нельзя ни из полосы, ни из меню.
  await expect(page.getByRole('button', { name: 'Открепить' })).toHaveCount(0);
  const menu = await menuOf(page, 'Кто что берёт на пикник?');
  await expect(menu.getByRole('menuitem', { name: /Закрепить|Открепить/ })).toHaveCount(0);
});

test('«печатает…»: Вера отвечает на сообщение и затихает', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Кто за рулём?');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText('Вера печатает…')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Вера печатает…')).toBeHidden({ timeout: 15_000 });
});

test('HTML сообщения: разметка на месте, скрипта нет, картинка — подписью; под CSP без ошибок', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Дом 14/);
  const agenda = bubble(page, 'Повестка');
  await expect(agenda.locator('b')).toHaveText('Повестка');
  await expect(agenda.getByRole('listitem')).toHaveText(['лифт', 'двор']);
  await expect(agenda.getByRole('link', { name: 'полностью здесь' })).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(agenda).toContainText('[схема двора]');
  await expect(agenda.locator('script, img')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('черновик переживает переход в другой чат и перезагрузку', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const field = page.getByRole('textbox', { name: 'Сообщение' });
  await field.fill('Недописанная мысль');
  await openRoom(page, /^Дом 14/);
  await expect(field).toHaveValue('');
  await openRoom(page, /^Выходные/);
  await expect(field).toHaveValue('Недописанная мысль');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: 'Сообщение' })).toHaveValue('Недописанная мысль', { timeout: 20_000 });
});

test('мышь: панель по наведению; справка по клавишам — по «?»', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'наведение и клавиатура — десктоп');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const pie = bubble(page, 'Я — пирог');
  await pie.hover();
  // Панель — рядом с пузырём, у каждого сообщения своя.
  await pie.locator('..').getByRole('button', { name: 'Ответить' }).click();
  await expect(page.getByText('Ответ', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Сообщение' }).press('Escape');

  await page.getByRole('log').click();
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Сочетания клавиш' });
  await expect(help).toContainText('Быстрый переход к чату');
  await expect(help).toContainText('изменить последнее своё');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();

  // `Esc`, когда закрывать нечего: вниз, к последнему.
  await openRoom(page, /^Длинная история/);
  await expect(bubble(page, 'Сообщение номер 400')).toBeInViewport();
  await page.getByRole('log').evaluate((log) => log.parentElement!.scrollBy({ top: -300 }));
  const toBottom = page.getByRole('button', { name: 'Вниз, к последнему сообщению' });
  await expect(toBottom).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toBottom).toBeHidden();
  await expect(bubble(page, 'Сообщение номер 400')).toBeInViewport();
});

test('телефон: меню листом снизу', async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), 'лист — для пальца');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const menu = await menuOf(page, 'Я — пирог');
  const box = (await menu.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y + box.height).toBeGreaterThan(viewport.height - 40);
  expect(box.width).toBeGreaterThan(viewport.width - 40);
});

test('телефон: долгое нажатие открывает меню и там, где браузер не шлёт contextmenu (iOS)', async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), 'касание');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const pie = bubble(page, 'Я — пирог');
  const box = (await pie.boundingBox())!;
  const at = { clientX: box.x + 10, clientY: box.y + 10, pointerId: 7, pointerType: 'touch', isPrimary: true };
  // Только касание, без `contextmenu`: так ведёт себя Safari на iPhone и iPad.
  await pie.dispatchEvent('pointerdown', at);
  const menu = page.getByRole('menu', { name: 'Ещё' });
  await expect(menu).toBeVisible();
  await pie.dispatchEvent('pointerup', at);
  // А Android шлёт `contextmenu` следом — второго меню (и закрытия первого) это не вызывает.
  await pie.dispatchEvent('contextmenu', { clientX: at.clientX, clientY: at.clientY });
  await expect(menu).toBeVisible();
  await expect(page.getByRole('menu')).toHaveCount(1);
});

test('геопозиция: из меню скрепки, с честной точностью в вопросе — и карточкой в ленте', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 55.755831, longitude: 37.617673, accuracy: 1200 });
  await signInToDemo(page);
  await openRoom(page, /^Аня/);

  await page.getByRole('button', { name: 'Добавить фото или файл' }).click();
  const menu = page.getByRole('menu', { name: 'Добавить фото или файл' });
  await expect(menu.getByRole('menuitem')).toHaveText(['Фото или видео', 'Файл', 'Геопозиция']);
  await menu.getByRole('menuitem', { name: 'Геопозиция' }).click();

  const dialog = page.getByRole('dialog', { name: 'Отправить, где вы сейчас?' });
  await expect(dialog).toContainText('около 1,2 км');
  await dialog.getByRole('button', { name: 'Отправить' }).click();

  const card = page.getByRole('log').getByRole('article').filter({ hasText: 'Геопозиция' }).last();
  await expect(card).toContainText('55,75583');
  await expect(card).toContainText('± 1,2 км');
  await expect(card.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute('href', /mlat=55\.755831&mlon=37\.617673/);
  await expect(page.getByRole('img', { name: 'Отправляется' })).toHaveCount(0, { timeout: 10_000 });
});

test('отметки — рядом с пузырём: «глаз» у самого нового прочитанного своего, галочка — у ещё не прочитанного', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  const log = page.getByRole('log');
  // Аня ответила после «Поеду!» — значит, прочитала его и всё выше; «глаз» — только у него.
  await expect(log.getByRole('img', { name: 'Прочитано' })).toHaveCount(1);
  const read = log.locator('.row').filter({ hasText: 'Поеду! Во сколько?' });
  await expect(read.getByRole('img', { name: 'Прочитано' })).toBeVisible();
  // Время — не в пузыре.
  await expect(bubble(page, 'Поеду! Во сколько?').locator('time')).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Беру термос');
  await page.getByRole('button', { name: 'Отправить' }).click();
  const mine = log.locator('.row').filter({ hasText: 'Беру термос' });
  await expect(mine.getByRole('img', { name: 'Отправлено' })).toBeVisible({ timeout: 10_000 });
});
