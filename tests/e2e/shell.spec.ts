import { expect, test } from '@playwright/test';
import { isPhone, signInToDemo, watchForProblems } from './helpers';

test('адрес чата открывает чат; на телефоне — вместо списка, на десктопе — рядом', async ({ page }, info) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await page.goto('/#/room/' + encodeURIComponent('!abc:example.org'));
  await expect(page.getByRole('heading', { name: '!abc:example.org' })).toBeVisible();
  const list = page.getByRole('heading', { name: 'Чаты', level: 1 });
  if (isPhone(info.project.name)) {
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
  test.skip(isPhone(info.project.name), 'только десктоп');
  await signInToDemo(page);
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
  test.skip(isPhone(info.project.name), 'только десктоп');
  await signInToDemo(page);
  const separator = page.getByRole('separator', { name: 'Ширина списка чатов' });
  await separator.focus();
  await page.keyboard.press('End');
  await expect(separator).toHaveAttribute('aria-valuenow', '25');
  await page.reload({ waitUntil: 'domcontentloaded' });
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
