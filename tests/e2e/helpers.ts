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

/** Консоль и переходы страницы — для теста, который хочет рассказать, почему упал. */
export function consoleOf(page: Page): string[] {
  return recordConsole(page);
}

/**
 * Вход в демо: alice / password — и шаг восстановления после него. Новый аккаунт получает
 * код (его и возвращаем); аккаунт, у которого код уже есть, шаг откладывает («Закрыть») —
 * тесту чатов переписка из резервной копии не нужна.
 */
export async function signInToDemo(page: Page): Promise<string | null> {
  await enterDemoCredentials(page);
  const code = await passRecoveryStep(page);
  await expect(page.getByRole('heading', { name: 'Чаты', level: 1 })).toBeVisible({ timeout: 20_000 });
  return code;
}

/**
 * Ввести адрес аккаунта и отправить. Enter'ом из поля, а не кликом: клик по активной
 * «Продолжить» Firefox в CI изредка терял (и на телефоне, и на десктопе) — ни запроса,
 * ни ошибки, ни «занято». Enter — такой же путь человека и не зависит от координат кнопки.
 */
export async function submitAddress(page: Page, address: string): Promise<void> {
  const field = page.getByRole('textbox', { name: 'Адрес аккаунта' });
  await field.fill(address);
  // Кнопка становится активной после ввода — значит, Svelte уже видит адрес.
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeEnabled();
  await field.press('Enter');
}

/** До нажатия «Войти с паролем» включительно. */
export async function enterDemoCredentials(page: Page): Promise<void> {
  const log = recordConsole(page);
  // Не ждём `load`: приложению он не нужен, а Firefox в CI изредка его так и не присылает.
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  } catch (error) {
    // Firefox в CI однажды не дождался и DOMContentLoaded. Он приходит после того, как
    // исполнены модули бандла, — значит, какой-то из них не пришёл. Какой — скажет ошибка.
    throw new Error(
      `Страница не загрузилась.\nНе закончились: ${[...(pending.get(page) ?? [])].join(', ') || '—'}\nКонсоль и переходы:\n${log.slice(-30).join('\n')}`,
      { cause: error },
    );
  }
  await submitAddress(page, DEMO_ADDRESS);
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
}

async function passRecoveryStep(page: Page): Promise<string | null> {
  const save = page.getByRole('heading', { name: 'Сохраните код' });
  const unlock = page.getByRole('heading', { name: 'Разблокируйте переписку' });
  const chats = page.getByRole('heading', { name: 'Чаты', level: 1 });
  // Резервная копия создаётся с ключами кросс-подписи — на медленном движке это секунды.
  await expect(save.or(unlock).or(chats)).toBeVisible({ timeout: 30_000 });
  if (await save.isVisible()) return saveRecoveryCode(page);
  if (await unlock.isVisible()) await page.getByRole('button', { name: 'Закрыть' }).click();
  return null;
}

/** Экран «Сохраните код»: забрать код, поставить галочку, «Я сохранил код». */
export async function saveRecoveryCode(page: Page): Promise<string> {
  const code = (await page.getByTestId('recovery-code').innerText()).trim();
  const saved = page.getByRole('button', { name: 'Я сохранил код' });
  // Без галочки кнопка не нажимается: сначала прочитать предупреждение.
  await expect(saved).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Я записал код в надёжное место' }).check();
  await saved.click();
  return code;
}

export const isPhone = (projectName: string) => projectName.endsWith('phone');

/** Выйти: «Выйти» живёт в настройках, внизу, — и спрашивает, правда ли. */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Настройки' }).click();
  await page.getByRole('button', { name: 'Выйти' }).click();
  const dialog = page.getByRole('dialog', { name: 'Выйти из Iskra?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByRole('heading', { name: 'Добро пожаловать в Iskra' })).toBeVisible();
}
