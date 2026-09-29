import { expect, test } from '@playwright/test';
import { isPhone, signInToDemo, watchForProblems } from './helpers';

test('список чатов из демо: имена, превью, значки, заголовок вкладки', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);

  const weekend = page.getByRole('link', { name: /^Выходные/ });
  await expect(weekend).toBeVisible();
  await expect(weekend).toContainText('Алиса, ты с нами?');
  // Упоминание — «@», число — рядом; скринридер слышит оба.
  await expect(weekend).toHaveAccessibleName(/3 непрочитанных, 1 упоминание вас/);
  await expect(page.getByRole('link', { name: /^Аня, Защищённый чат, Закреплённый чат/ })).toBeVisible();
  // Приглашение, личный чат, упоминание; беззвучный «Дом 14» не в счёт.
  await expect(page).toHaveTitle('(3) Iskra');
  expect(problems).toEqual([]);
});

test('один список на любой ширине: архив сверху, приглашение, закреплённый, дальше по активности', async ({ page }) => {
  await signInToDemo(page);
  const column = page.locator('.list-column');
  // Ни заголовков разделов, ни фильтров — как в нативной Искре.
  await expect(column.getByRole('heading', { level: 2 })).toHaveCount(0);
  await expect(column.getByRole('toolbar')).toHaveCount(0);

  const order = await column.locator('button.archive, [role=group], a[data-room-id]').evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('aria-label') ?? row.textContent?.trim().split('\n')[0] ?? ''),
  );
  expect(order[0]).toMatch(/^Архив/);
  expect(order[1]).toBe('Книжный клуб');
  expect(order[2]).toMatch(/^Аня/);
  // Пространство «Семья» — не отдельным разделом, а среди чатов, после закреплённого.
  expect(order.slice(3).some((name) => name.startsWith('Семья'))).toBe(true);
  expect(order.findIndex((name) => name.startsWith('Выходные'))).toBeLessThan(order.findIndex((name) => name.startsWith('Дом 14')));
});

test('чат открывается из списка, его имя — в шапке', async ({ page }) => {
  await signInToDemo(page);
  await page.getByRole('link', { name: /^Выходные/ }).click();
  await expect(page).toHaveURL(/#\/room\/!weekend/);
  await expect(page.getByRole('heading', { name: 'Выходные', level: 1 })).toBeVisible();
});

test('архив и пространство открываются на месте списка', async ({ page }) => {
  await signInToDemo(page);
  await page.getByRole('button', { name: 'Архив (1)' }).click();
  await expect(page.getByRole('link', { name: /^Старый проект/ })).toBeVisible();
  await page.getByRole('button', { name: 'Назад' }).first().click();
  await expect(page.getByRole('link', { name: /^Выходные/ })).toBeVisible();
});

test('приглашение: «Войти» — и это обычный чат', async ({ page }) => {
  await signInToDemo(page);
  const invite = page.getByRole('group', { name: 'Книжный клуб' });
  await expect(invite).toContainText('Борис приглашает вас');
  await invite.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('link', { name: /^Книжный клуб/ })).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveTitle('(2) Iskra');
});

test('Ctrl/⌘ K — быстрый переход по названию', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'клавиатура — десктоп');
  await signInToDemo(page);
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: 'Перейти к чату' });
  await expect(dialog).toBeVisible();
  await page.keyboard.type('дом');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Дом 14, подъезд 2', level: 1 })).toBeVisible();
});

test('Alt ↓ — следующий чат', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'клавиатура — десктоп');
  await signInToDemo(page);
  await page.getByRole('link', { name: /^Аня/ }).click();
  // Сначала чат должен открыться — иначе «следующий» считается от «никакого».
  await expect(page.getByRole('heading', { name: 'Аня', level: 1 })).toBeVisible();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.getByRole('heading', { name: 'Выходные', level: 1 })).toBeVisible();
});
