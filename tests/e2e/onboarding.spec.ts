import { expect, test } from '@playwright/test';
import { enterDemoCredentials, openApp, watchForProblems } from './helpers';

// Чистое устройство: слайды ещё не показаны (остальным тестам их засевает конфиг).
test.use({ storageState: { cookies: [], origins: [] } });

test('первый раз на устройстве — слайды, потом вход; после входа — привет, цвет, мордочки', async ({ page }) => {
  const problems = watchForProblems(page);
  await openApp(page);
  await expect(page.getByRole('heading', { name: 'Iskra', level: 1 })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Слайд 1 из 5' })).toBeVisible();
  // Стрелками — на следующий, и за последний не уезжает.
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Анонимно' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Слайд 5 из 5' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать' }).click();
  await expect(page.getByRole('heading', { name: 'Добро пожаловать в Iskra' })).toBeVisible();

  // Слайды — один раз на устройство.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Добро пожаловать в Iskra' })).toBeVisible();

  await enterDemoCredentials(page);
  const save = page.getByRole('heading', { name: 'Сохраните код' });
  await expect(save).toBeVisible({ timeout: 30_000 });
  await page.getByRole('checkbox', { name: 'Я записал код в надёжное место' }).check();
  await page.getByRole('button', { name: 'Я сохранил код' }).click();

  // Привет — сам уходит через три секунды.
  await expect(page.getByRole('heading', { name: /^Привет/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Какого цвета Iskra?' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('radio', { name: 'Зелёный' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'green');
  await page.getByRole('button', { name: 'Продолжить' }).click();

  await expect(page.getByRole('heading', { name: 'Кому рисовать мордочки' })).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Кому рисовать мордочки' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Мордочки');
  await page.getByRole('button', { name: 'Продолжить' }).click();

  await expect(page.getByRole('heading', { name: 'Чаты', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByRole('radio', { name: /^Мордочки/ })).toHaveAttribute('aria-checked', 'true');
  expect(problems).toEqual([]);
});
