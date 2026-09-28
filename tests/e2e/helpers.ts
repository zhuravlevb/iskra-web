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

/** Вся консоль страницы — для диагностики падений в CI, где экрана не видно. */
const consoles = new WeakMap<Page, string[]>();
/** Запросы, которые начались и не закончились, — кто держит страницу недогруженной. */
const pending = new WeakMap<Page, Set<string>>();
function recordConsole(page: Page): string[] {
  let lines = consoles.get(page);
  if (!lines) {
    const record: string[] = [];
    lines = record;
    consoles.set(page, record);
    page.on('console', (m) => record.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => record.push(`[pageerror] ${e.message}`));
    page.on('framenavigated', (f) => f === page.mainFrame() && record.push(`[navigated] ${f.url()}`));
    page.on('requestfailed', (r) => record.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText ?? ''}`));
    const open = new Set<string>();
    pending.set(page, open);
    page.on('request', (r) => open.add(r.url()));
    page.on('requestfinished', (r) => open.delete(r.url()));
    page.on('requestfailed', (r) => open.delete(r.url()));
  }
  return lines;
}

/** Вход в демо: alice / password. */
export async function signInToDemo(page: Page): Promise<void> {
  const log = recordConsole(page);
  // Не ждём `load`: приложению он не нужен, а Firefox в CI изредка его так и не присылает.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Адрес аккаунта' }).fill(DEMO_ADDRESS);
  // Кнопка становится активной после ввода — не раньше, чем Svelte обновит DOM. Нажатие в
  // этот момент Firefox в CI изредка терял: экран оставался на адресе, без ошибки и без
  // запросов (так показала диагностика ниже).
  const continueButton = page.getByRole('button', { name: 'Продолжить' });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  // Демо умеет и SSO, и пароль: вход по умолчанию — через страницу сервера, пароль — за фразой.
  const passwordDoor = page.getByRole('button', { name: 'У меня только логин и пароль' });
  const problem = page.getByRole('alert');
  try {
    await expect(passwordDoor.or(problem)).toBeVisible({ timeout: 15_000 });
  } catch (error) {
    // Логи CI не показывают экран — пусть покажет ошибка.
    const snapshot = await page.locator('body').ariaSnapshot().catch(() => '(нет снимка)');
    throw new Error(
      `Вход в демо завис после «Продолжить».\nАдрес: ${page.url()}\nНе закончились: ${[...(pending.get(page) ?? [])].join(', ') || '—'}\nЭкран:\n${snapshot}\nКонсоль и переходы:\n${log.slice(-30).join('\n')}`,
      { cause: error },
    );
  }
  // Если сервер не нашёлся — сказать, что написано на экране, а не упасть по таймауту.
  if (await problem.isVisible()) throw new Error(`Вход в демо: ${await problem.innerText()}`);
  await passwordDoor.click();
  await page.getByRole('textbox', { name: 'Имя пользователя' }).fill('alice');
  await page.getByLabel('Пароль').fill('password');
  await page.getByRole('button', { name: 'Войти с паролем' }).click();
  await expect(page.getByRole('heading', { name: 'Чаты', level: 1 })).toBeVisible({ timeout: 20_000 });
}

export const isPhone = (projectName: string) => projectName.endsWith('phone');
