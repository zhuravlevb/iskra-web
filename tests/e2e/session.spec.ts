import { expect, test } from '@playwright/test';
import { DEMO_ADDRESS, signInToDemo, watchForProblems } from './helpers';

test('экран входа под строгой CSP, без ошибок', async ({ page }) => {
  const problems = watchForProblems(page);
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page.getByRole('heading', { name: 'Добро пожаловать в Iskra' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('непонятный адрес — красная панель, а не тишина', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Адрес аккаунта' }).fill('не адрес');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('alert')).toContainText('По этому адресу мы ничего не нашли');
});

test('неверный пароль — сказано, и можно попробовать снова', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Адрес аккаунта' }).fill(DEMO_ADDRESS);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.getByRole('button', { name: 'У меня только логин и пароль' }).click();
  await page.getByRole('textbox', { name: 'Имя пользователя' }).fill('alice');
  await page.getByLabel('Пароль').fill('wrong');
  await page.getByRole('button', { name: 'Войти с паролем' }).click();
  await expect(page.getByRole('alert')).toContainText('Имя пользователя или пароль не подошли');
});

test('вход в демо с Rust-крипто под CSP, сессия переживает перезагрузку, выход стирает всё', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Чаты', level: 1 })).toBeVisible({ timeout: 20_000 });

  const databases = async () => (await page.evaluate(() => indexedDB.databases())).map((d) => d.name ?? '');
  const mine = (names: string[]) => names.filter((n) => n.includes('@alice:demo.iskra.invalid'));
  // Rust-крипто в WASM поднялось под CSP и завело свою зашифрованную базу.
  expect(mine(await databases()).some((n) => n.includes('matrix-sdk-crypto'))).toBe(true);
  expect(mine(await databases()).some((n) => n.includes('iskra-sync'))).toBe(true);

  await page.getByRole('button', { name: 'Выйти' }).click();
  const dialog = page.getByRole('dialog', { name: 'Выйти из Iskra?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByRole('heading', { name: 'Добро пожаловать в Iskra' })).toBeVisible();

  await expect.poll(async () => mine(await databases())).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Добро пожаловать в Iskra' })).toBeVisible();
  // Rust-крипто может ворчать в консоль при удалении своей базы на ходу — это не наша ошибка,
  // а вот нарушения CSP и падения страницы — наши.
  expect(problems.filter((p) => /Content Security Policy|Trusted|Uncaught|TypeError/.test(p))).toEqual([]);
});

test('вторая вкладка получает «уже открыта», и её можно забрать себе', async ({ page, context }) => {
  await signInToDemo(page);

  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByRole('heading', { name: 'Iskra уже открыта в другом окне' })).toBeVisible({ timeout: 20_000 });

  await second.getByRole('button', { name: 'Открыть здесь' }).click();
  await expect(second.getByRole('heading', { name: 'Чаты', level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Iskra уже открыта в другом окне' })).toBeVisible();
});
