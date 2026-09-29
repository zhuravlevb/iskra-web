import { expect, test, type Page } from '@playwright/test';
import { consoleOf, isPhone, signInToDemo, signOut, watchForProblems } from './helpers';

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) console.log(`Консоль «${info.title}»:\n${consoleOf(page).slice(-40).join('\n')}`);
});

async function openRoom(page: Page, name: RegExp) {
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('log')).toBeVisible();
}

async function openPanel(page: Page) {
  await page.getByRole('button', { name: 'О чате' }).click();
  const panel = page.getByRole('radiogroup', { name: 'Уведомления' }).locator('xpath=ancestor::div[contains(@class,"panel")][1]');
  await expect(panel).toBeVisible();
  return panel;
}

test('«О чате» там, где прав нет: только уведомления, закреплённые, участники и выход', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const panel = await openPanel(page);
  await expect(panel.getByRole('button', { name: 'Изменить' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: /Борис.*Администратор/ })).toBeVisible();
  await expect(panel).toContainText('3 участника');

  const alerts = panel.getByRole('radiogroup', { name: 'Уведомления' });
  await expect(alerts.getByRole('radio', { name: 'Все сообщения' })).toHaveAttribute('aria-checked', 'true');
  await alerts.getByRole('radio', { name: 'Выключены' }).click();
  await expect(alerts.getByRole('radio', { name: 'Выключены' })).toHaveAttribute('aria-checked', 'true');

  // Закреплённое из панели ведёт к сообщению.
  await panel.getByRole('button', { name: /Кто что берёт на пикник/ }).click();
  await expect(page.getByRole('log').getByRole('article').filter({ hasText: 'Кто что берёт на пикник?' })).toBeInViewport();
  expect(problems).toEqual([]);
});

test('своя комната: изменить название, дать роль, пригласить — и кривой адрес', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Длинная история/);
  const panel = await openPanel(page);

  await panel.getByRole('button', { name: 'Изменить' }).click();
  const edit = page.getByRole('dialog', { name: 'Изменить чат' });
  await edit.getByRole('textbox', { name: 'Название' }).fill('Очень длинная история');
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(edit).toBeHidden();
  await expect(panel.getByRole('heading', { name: 'Очень длинная история' })).toBeVisible({ timeout: 10_000 });

  await panel.getByRole('button', { name: /^Борис/ }).click();
  await page.getByRole('menuitem', { name: 'Роль' }).click();
  const role = page.getByRole('dialog', { name: 'Что может Борис?' });
  await role.getByRole('radio', { name: 'Модератор' }).click();
  await expect(panel.getByRole('button', { name: /Борис.*Модератор/ })).toBeVisible({ timeout: 10_000 });

  await panel.getByRole('button', { name: 'Пригласить' }).click();
  const invite = page.getByRole('dialog', { name: 'Кого пригласить?' });
  await invite.getByRole('textbox').fill('аня');
  await invite.getByRole('button', { name: 'Пригласить' }).click();
  await expect(invite).toContainText('Проверьте адрес');
  await invite.getByRole('textbox').fill('@anya:demo.iskra.invalid');
  await invite.getByRole('button', { name: 'Пригласить' }).click();
  await expect(invite).toBeHidden();
  await expect(panel.getByRole('button', { name: /Аня.*Приглашение отправлено/ })).toBeVisible({ timeout: 10_000 });
});

test('выйти из чата — с вопросом, и чата больше нет в списке', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Дом 14/);
  const panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Выйти из чата' }).click();
  const dialog = page.getByRole('dialog', { name: 'Выйти из чата?' });
  await expect(dialog).toContainText('только по приглашению');
  await dialog.getByRole('button', { name: 'Выйти из чата' }).click();
  await expect(page.getByRole('link', { name: /^Дом 14/ })).toHaveCount(0, { timeout: 10_000 });
});

test('новая комната и новый чат — создаются и сразу открываются', async ({ page }) => {
  await signInToDemo(page);
  await page.getByRole('button', { name: 'Новый чат или комната' }).click();
  const dialog = page.getByRole('dialog', { name: 'Новый чат или комната' });
  await dialog.getByRole('tab', { name: 'Новая комната' }).click();
  await expect(dialog).toContainText('поэтому шифрования в ней нет');
  await dialog.getByRole('textbox', { name: 'Название' }).fill('Книги');
  await dialog.getByRole('button', { name: 'Создать' }).click();
  await expect(page.getByRole('heading', { name: 'Книги', level: 1 })).toBeVisible({ timeout: 10_000 });

  // Кнопка — в шапке списка; на телефоне список — за «Назад».
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await page.getByRole('button', { name: 'Новый чат или комната' }).click();
  await dialog.getByRole('textbox', { name: 'Кому написать' }).fill('@anya:demo.iskra.invalid');
  await dialog.getByRole('button', { name: 'Начать' }).click();
  // С Аней чат уже есть — открывается он, а не второй.
  await expect(page.getByRole('log')).toContainText('Возьми плед, там ветрено', { timeout: 10_000 });
});

test('настройки: имя, язык, тема, шрифт; устройство и хранилище видны', async ({ page }, info) => {
  await signInToDemo(page);
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByRole('heading', { name: 'Ваш профиль' })).toBeVisible();

  const name = page.getByRole('textbox', { name: 'Имя' });
  await name.fill('Алиса Петровна');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Алиса Петровна', { exact: true })).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText('Это устройство', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Хранилище' })).toBeVisible();

  await page.getByRole('radio', { name: 'Тёмное' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // Inter — по умолчанию и из своих файлов под боевой CSP: кириллица и латиница загрузились.
  await expect(page.getByRole('radio', { name: 'Inter' })).toHaveAttribute('aria-checked', 'true');
  const bodyFont = () => page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(await bodyFont()).toMatch(/^"?Inter"?,/);
  expect(await page.evaluate(async () => (await document.fonts.load('1rem Inter', 'Привет, hello')).length)).toBeGreaterThan(1);
  await page.getByRole('radio', { name: 'Системный' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-font', 'system');
  expect(await bodyFont()).toMatch(/^system-ui,/);
  await page.getByRole('radio', { name: 'Inter' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-font');

  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await page.getByRole('radio', { name: 'Русский' }).click();
  await expect(page.getByRole('heading', { name: 'Ваш профиль' })).toBeVisible();

  if (!isPhone(info.project.name)) {
    // `Ctrl/⌘ ,` — из любого места.
    await page.goto('/#/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Чаты', level: 1 })).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('ControlOrMeta+Comma');
    await expect(page.getByRole('heading', { name: 'Ваш профиль' })).toBeVisible();
  }
});

test('заблокировать из меню сообщения — сообщений не видно; разблокировать — в настройках', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Дом 14/);
  const bubble = page.getByRole('log').getByRole('article').filter({ hasText: 'Лифт опять не работает' });
  await bubble.click({ button: 'right' });
  await page.getByRole('menu', { name: 'Ещё' }).getByRole('menuitem', { name: 'Заблокировать' }).click();
  const dialog = page.getByRole('dialog', { name: 'Заблокировать Вера?' });
  await expect(dialog).toContainText('Разблокировать можно в настройках');
  await dialog.getByRole('button', { name: 'Заблокировать' }).click();
  await expect(bubble).toHaveCount(0, { timeout: 10_000 });
  // Служебная строка о ней остаётся: блокировка прячет слова, а не факт, что человек в чате.
  await expect(page.getByRole('log')).toContainText('Повестка');

  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  // И в списке чатов её слова не превью.
  await expect(page.getByRole('link', { name: /^Дом 14/ })).not.toContainText('Лифт опять');

  await page.getByRole('button', { name: 'Настройки' }).click();
  const section = page.getByRole('region', { name: 'Заблокированные' });
  await expect(section).toContainText('@vera:demo.iskra.invalid');
  await section.getByRole('button', { name: 'Разблокировать' }).click();
  await expect(section).toContainText('Никто не заблокирован', { timeout: 10_000 });
  expect(problems).toEqual([]);
});

test('«О чате»: вкладки «Что внутри» — фото, файлы, ссылки из загруженной ленты', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const panel = await openPanel(page);
  const tabs = panel.getByRole('tablist', { name: 'Что внутри' });
  // Голосовых и кружков в «Выходных» нет — и вкладок для них нет.
  await expect(tabs.getByRole('tab')).toHaveText(['Участники', 'Фото и видео', 'Файлы', 'Ссылки']);
  await expect(tabs.getByRole('tab', { name: 'Участники' })).toHaveAttribute('aria-selected', 'true');

  await tabs.getByRole('tab', { name: 'Фото и видео' }).click();
  const grid = panel.getByRole('tabpanel');
  await expect(grid.getByRole('button', { name: 'Фото' })).toHaveCount(2);
  // Стрелки ходят по вкладкам.
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Файлы' })).toBeFocused();
  await expect(panel.getByRole('tabpanel')).toContainText('Что взять.txt');
  await page.keyboard.press('ArrowRight');
  const link = panel.getByRole('tabpanel').getByRole('link', { name: 'https://example.org/weather' });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(panel.getByRole('tabpanel')).toContainText('вроде солнце');

  await tabs.getByRole('tab', { name: 'Фото и видео' }).click();
  await panel.getByRole('tabpanel').getByRole('button', { name: 'Фото' }).first().click();
  // Просмотрщик листает фото этой вкладки, новое — первым.
  const viewer = page.getByRole('dialog', { name: 'Фото' });
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText('1 из 2');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  expect(problems).toEqual([]);
});

test('локальное имя личного чата: видно везде, переживает перезагрузку, возвращается', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  let panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Изменить' }).click();
  const edit = page.getByRole('dialog', { name: 'Изменить чат' });
  // В личном чате — одно поле; имя, описание и фото комнаты принадлежат собеседнику.
  await expect(edit.getByRole('textbox')).toHaveCount(1);
  const field = edit.getByRole('textbox', { name: 'Имя на этом устройстве' });
  await expect(field).toHaveAttribute('placeholder', 'Аня');
  await field.fill('Анечка');
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(edit).toBeHidden();
  await expect(panel.getByRole('heading', { name: 'Анечка' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'О чате' })).toBeVisible({ timeout: 15_000 });
  // И в списке, и в шапке чата.
  await openRoom(page, /^Анечка/);
  await expect(page.getByRole('heading', { name: 'Анечка', level: 1 })).toBeVisible();

  panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Изменить' }).click();
  await page.getByRole('dialog', { name: 'Изменить чат' }).getByRole('button', { name: 'Вернуть настоящее имя' }).click();
  await expect(panel.getByRole('heading', { name: 'Аня' })).toBeVisible();
  // На телефоне панель — лист поверх чата: сначала закрыть её.
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await expect(page.getByRole('link', { name: /^Аня/ })).toBeVisible();
  expect(problems).toEqual([]);
});

test('обои: градиент за перепиской и непрозрачные пузыри; своё фото — до выхода из аккаунта', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await page.getByRole('button', { name: 'Настройки' }).click();
  const tiles = page.getByRole('radiogroup', { name: 'Обои' });
  await expect(tiles.getByRole('radio', { name: 'Без обоев' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('slider')).toHaveCount(0);
  await tiles.getByRole('radio', { name: 'Море' }).click();
  await expect(page.getByRole('slider')).toBeVisible();

  await openRoom(page, /^Аня/);
  const room = page.getByRole('region', { name: 'Переписка' });
  await expect(room).toHaveAttribute('data-wallpaper', '');
  // На обоях входящий пузырь — непрозрачный, а не восемь процентов чёрного.
  const bubble = page.getByRole('log').getByRole('article').filter({ hasText: 'Возьми плед' });
  await expect.poll(() => bubble.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(252, 252, 252)');

  // Своё фото: выбрать — и оно за перепиской, и переживает перезагрузку.
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await page.getByRole('button', { name: 'Настройки' }).click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const chooser = page.waitForEvent('filechooser');
  await tiles.getByRole('radio', { name: 'Своё фото' }).click();
  await (await chooser).setFiles({ name: 'wall.png', mimeType: 'image/png', buffer: png });
  await expect(tiles.getByRole('radio', { name: 'Своё фото' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Выбрать другое фото' })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  // Сначала дождаться экрана: `openRoom` спрашивает «видно ли „Назад“» один раз и сразу.
  await expect(page.getByRole('heading', { name: 'Настройки', level: 1 })).toBeVisible({ timeout: 20_000 });
  await openRoom(page, /^Аня/);
  await expect(page.locator('[data-wallpaper-kind="photo"] img')).toBeVisible();

  if (await back.isVisible()) await back.click();
  await signOut(page);
  await expect.poll(async () => (await page.evaluate(() => indexedDB.databases())).map((d) => d.name)).not.toContain('iskra-wallpaper');
  expect(problems).toEqual([]);
});
