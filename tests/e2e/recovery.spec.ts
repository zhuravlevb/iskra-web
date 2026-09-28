import { expect, test } from '@playwright/test';
import { enterDemoCredentials, signInToDemo, watchForProblems } from './helpers';

/**
 * Весь путь восстановления на демо-сервере: аккаунт Алисы переживает выход (он лежит в
 * `sessionStorage` вкладки), а вход заново — это новое устройство, которому нужен код.
 */
test('новый аккаунт → код → выход → вход новым устройством → код открывает переписку', async ({ page }) => {
  const problems = watchForProblems(page);
  const code = await signInToDemo(page);
  expect(code).toMatch(/^\S{4}( \S{1,4})+$/);
  // Всё открыто — плашки нет.
  await expect(page.getByRole('button', { name: 'Старая переписка заблокирована' })).toBeHidden();

  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.getByRole('dialog', { name: 'Выйти из Iskra?' }).getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByRole('heading', { name: 'Добро пожаловать в Iskra' })).toBeVisible();

  await enterDemoCredentials(page);
  await expect(page.getByRole('heading', { name: 'Разблокируйте переписку' })).toBeVisible({ timeout: 30_000 });

  // Отложил — плашка в списке чатов помнит и ведёт обратно.
  await page.getByRole('button', { name: 'Закрыть' }).click();
  const locked = page.getByRole('button', { name: 'Старая переписка заблокирована' });
  await expect(locked).toBeVisible({ timeout: 20_000 });
  await locked.click();

  await page.getByRole('button', { name: 'У меня есть код восстановления' }).click();
  const field = page.getByRole('textbox', { name: 'Код восстановления' });
  await field.fill('это не код');
  await page.getByRole('button', { name: 'Разблокировать переписку' }).click();
  await expect(page.getByRole('alert')).toContainText('Код не подошёл');

  await field.fill(code!);
  await page.getByRole('button', { name: 'Разблокировать переписку' }).click();
  await expect(page.getByRole('heading', { name: 'Чаты', level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(locked).toBeHidden();
  expect(problems.filter((p) => /Content Security Policy|Trusted|Uncaught|TypeError/.test(p))).toEqual([]);
});

test('ни кода, ни другого устройства: пароль — и новый код взамен', async ({ page }) => {
  await signInToDemo(page);
  await page.getByRole('button', { name: 'Выйти' }).click();
  await page.getByRole('dialog', { name: 'Выйти из Iskra?' }).getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByRole('heading', { name: 'Добро пожаловать в Iskra' })).toBeVisible();

  await enterDemoCredentials(page);
  await page.getByRole('button', { name: 'Нет ни того, ни другого' }).click({ timeout: 30_000 });
  // Первое устройство вышло, но аккаунт о нём помнит: сначала предлагаем его.
  await page.getByRole('button', { name: 'Нет доступа к тому устройству' }).click();
  await page.getByRole('button', { name: 'Начать заново' }).click();

  const dialog = page.getByRole('dialog', { name: 'Введите пароль' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('textbox', { name: 'Пароль' }).fill('password');
  await dialog.getByRole('button', { name: 'Подтвердить' }).click();

  await expect(page.getByRole('heading', { name: 'Сохраните код' })).toBeVisible({ timeout: 30_000 });
});
