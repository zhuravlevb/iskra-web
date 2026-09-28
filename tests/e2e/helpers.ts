import { expect, type Page } from '@playwright/test';

export const DEMO_ADDRESS = 'demo.iskra.invalid';

/**
 * Сообщения браузеров, которые ошибкой не являются, — каждое с причиной. Список короткий
 * и явный: всё, чего в нём нет, валит тест.
 */
const BENIGN: RegExp[] = [
  // WebKit не знает `interactive-widget` в `<meta viewport>` и говорит об этом как об ошибке.
  // Ключ нужен Chrome на Android — композер над клавиатурой, — а WebKit его просто пропускает.
  /^Viewport argument key "interactive-widget" not recognized and ignored\.$/,
];

/** Собирает ошибки консоли и страницы: всё должно жить под боевой CSP без единой. */
export function watchForProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!BENIGN.some((pattern) => pattern.test(text))) problems.push(text);
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

/** Вход в демо: alice / password. */
export async function signInToDemo(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Адрес аккаунта' }).fill(DEMO_ADDRESS);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  // Демо умеет и SSO, и пароль: вход по умолчанию — через страницу сервера, пароль — за фразой.
  await page.getByRole('button', { name: 'У меня только логин и пароль' }).click();
  await page.getByRole('textbox', { name: 'Имя пользователя' }).fill('alice');
  await page.getByLabel('Пароль').fill('password');
  await page.getByRole('button', { name: 'Войти с паролем' }).click();
  await expect(page.getByRole('heading', { name: 'Чаты' })).toBeVisible({ timeout: 20_000 });
}

export const isPhone = (projectName: string) => projectName.endsWith('phone');
