import { expect, test, type Page } from '@playwright/test';

/** Собирает нарушения CSP и ошибки страницы: скелет должен жить под боевой политикой. */
function watchForProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

test('скелет открывается под строгой CSP без ошибок', async ({ page }) => {
  const problems = watchForProblems(page);
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  await expect(page.getByRole('heading', { name: 'Чаты' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('адрес чата открывает чат; на телефоне — вместо списка, на десктопе — рядом', async ({ page }, info) => {
  const problems = watchForProblems(page);
  const phone = info.project.name.endsWith('phone');
  await page.goto('/#/room/' + encodeURIComponent('!abc:example.org'));
  await expect(page.getByRole('heading', { name: '!abc:example.org' })).toBeVisible();
  const list = page.getByRole('heading', { name: 'Чаты' });
  if (phone) {
    await expect(list).toBeHidden();
    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(list).toBeVisible();
    await expect(page).toHaveURL(/#\/$/);
  } else {
    await expect(list).toBeVisible();
  }
  expect(problems).toEqual([]);
});

test('правая панель на широком экране сдвигает чат, а не перекрывает его', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('phone'), 'только десктоп');
  await page.goto('/#/room/' + encodeURIComponent('!abc:example.org'));
  const chat = page.locator('section.main');
  const before = (await chat.boundingBox())!.width;
  await page.getByRole('button', { name: 'О чате' }).click();
  await expect(page.locator('aside.panel')).toBeVisible();
  await expect(page.locator('.scrim')).toHaveCount(0);
  const after = (await chat.boundingBox())!.width;
  expect(after).toBeLessThan(before);
});

test('ширину списка можно менять с клавиатуры, и она запоминается', async ({ page }, info) => {
  test.skip(info.project.name.endsWith('phone'), 'только десктоп');
  await page.goto('/');
  const separator = page.getByRole('separator', { name: 'Ширина списка чатов' });
  await separator.focus();
  await page.keyboard.press('End');
  await expect(separator).toHaveAttribute('aria-valuenow', '25');
  await page.reload();
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '25');
  await page.getByRole('separator').dblclick();
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '20');
});

test('манифест устанавливаемого приложения на месте', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.launch_handler).toEqual({ client_mode: 'focus-existing' });
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
});
