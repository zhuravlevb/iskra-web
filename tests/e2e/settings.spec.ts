import { expect, test, type Page } from '@playwright/test';
import { consoleOf, isPhone, signInToDemo, watchForProblems } from './helpers';

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
