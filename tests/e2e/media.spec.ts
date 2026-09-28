import { expect, test, type Page } from '@playwright/test';
import { isPhone, signInToDemo, watchForProblems } from './helpers';

/** Настоящая PNG 32×20 — градиент. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAUCAIAAABj86gYAAAEqUlEQVR42g3Noc9EYADAYU2xiSZdI14QLr5RsYkmXXPRplx8o2ITTfIrJtoU8Y1XbCJNMtGmqN/3/AOPpmnoGqaGpfHQcDWeGi8NoeFrhBqRxlvjo5FqfDWkRq5RalQajUan0WuMGkrjpzFrLBqbxqFxatwammagG5gGlsHDwDV4GrwMhIFvEBpEBm+Dj0Fq8DWQBrlBaVAZNAadQW8wGiiDn8FssBhsBofBaXAb/4GNbmPaWDYPG9fmafOyETa+TWgT2bxtPjapzddG2uQ2pU1l09h0Nr3NaKNsfjazzWKz2Rw2p81t/wcOuoPpYDk8HFyHp8PLQTj4DqFD5PB2+DikDl8H6ZA7lA6VQ+PQOfQOo4Ny+DnMDovD5nA4nA638x946B6mh+Xx8HA9nh4vD+Hhe4Qekcfb4+ORenw9pEfuUXpUHo1H59F7jB7K4+cxeywem8fhcXrc3n8g0AWmwBI8BK7gKXgJhMAXhIJI8BZ8BKngK5CCXFAKKkEj6AS9YBQowU8wCxbBJjgEp+AW/0GAHmAGWAGPADfgGfAKEAF+QBgQBbwDPgFpwDdABuQBZUAV0AR0AX3AGKACfgFzwBKwBRwBZ8Ad/AcxeowZY8U8YtyYZ8wrRsT4MWFMFPOO+cSkMd8YGZPHlDFVTBPTxfQxY4yK+cXMMUvMFnPEnDF3/B8k6AlmgpXwSHATngmvBJHgJ4QJUcI74ZOQJnwTZEKeUCZUCU1Cl9AnjAkq4ZcwJywJW8KRcCbcyX+QoWeYGVbGI8PNeGa8MkSGnxFmRBnvjE9GmvHNkBl5RplRZTQZXUafMWaojF/GnLFkbBlHxplxZ/+BRJeYEkvykLiSp+QlERJfEkoiyVvykaSSr0RKckkpqSSNpJP0klGiJD/JLFkkm+SQnJJb/gcFeoFZYBU8CtyCZ8GrQBT4BWFBVPAu+BSkBd8CWZAXlAVVQVPQFfQFY4Eq+BXMBUvBVnAUnAV38R/U6DVmjVXzqHFrnjWvGlHj14Q1Uc275lOT1nxrZE1eU9ZUNU1NV9PXjDWq5lcz1yw1W81Rc9bc9X/QoreYLVbLo8Vteba8WkSL3xK2RC3vlk9L2vJtkS15S9lStTQtXUvfMraoll/L3LK0bC1Hy9lyt//BgD5gDlgDjwF34DnwGhAD/kA4EA28Bz4D6cB3QA7kA+VANdAMdAP9wDigBn4D88AysA0cA+fAPfwHCl1hKizFQ+EqnoqXQih8RaiIFG/FR5EqvgqpyBWlolI0ik7RK0aFUvwUs2JRbIpDcSpu9R9M6BPmhDXxmHAnnhOvCTHhT4QT0cR74jORTnwn5EQ+UU5UE81EN9FPjBNq4jcxTywT28QxcU7c03+woq+YK9bKY8Vdea68VsSKvxKuRCvvlc9KuvJdkSv5SrlSrTQr3Uq/Mq6old/KvLKsbCvHyrlyr//Bjr5j7lg7jx1357nz2hE7/k64E+28dz476c53R+7kO+VOtdPsdDv9zrijdn47886ys+0cO+fOvf8HF/qFeWFdPC7ci+fF60Jc+BfhRXTxvvhcpBffC3mRX5QX1UVz0V30F+OFuvhdzBfLxXZxXJwX98Uf1wfxouWu4FQAAAAASUVORK5CYII=', 'base64');

async function openRoom(page: Page, name: RegExp) {
  const back = page.getByRole('button', { name: 'Назад' });
  if (await back.isVisible()) await back.click();
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('log')).toBeVisible();
}

test('фото в ленте: место отведено до загрузки, просмотрщик листает и закрывается', async ({ page }, info) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const photos = page.getByRole('log').getByRole('button', { name: 'Фото' });
  await expect(photos).toHaveCount(2);
  // Пропорции из события: 1200×800 — полтора к одному, ещё до того, как пришли байты.
  const box = (await photos.first().boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(1.5, 1);
  await expect(photos.first().locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(page.getByRole('log')).toContainText('Озеро прошлым летом');

  await photos.first().click();
  const viewer = page.getByRole('dialog', { name: 'Фото' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('status')).toHaveText('1 из 2');
  await expect(viewer.locator('img')).toHaveAttribute('src', /^blob:/);
  if (!isPhone(info.project.name)) {
    await page.keyboard.press('ArrowRight');
    await expect(viewer.getByRole('status')).toHaveText('2 из 2');
    await page.keyboard.press('ArrowLeft');
    await expect(viewer.getByRole('status')).toHaveText('1 из 2');
  }
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  expect(problems).toEqual([]);
});

test('файл: «Сохранить» скачивает его с исходным именем', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const card = page.getByRole('log').getByRole('article').filter({ hasText: 'Что взять.txt' });
  await expect(card).toContainText('96');
  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Сохранить' }).click();
  expect((await download).suggestedFilename()).toBe('Что взять.txt');
});

test('фото в зашифрованный чат: выбрать → лоток → подпись → ушло и открывается', async ({ page }) => {
  const problems = watchForProblems(page);
  await signInToDemo(page);
  await openRoom(page, /^Аня/);
  await page.getByRole('log').locator('input[type=file]').or(page.locator('input[type=file]')).first().setInputFiles({ name: 'закат.png', mimeType: 'image/png', buffer: PNG });
  const tile = page.getByRole('img', { name: 'Фото к сообщению' });
  await expect(tile).toBeVisible();
  // «Убрать из сообщения» — и снова добавить: ничего не уходит само.
  await page.getByRole('button', { name: /^Убрать из сообщения/ }).click();
  await expect(tile).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles({ name: 'закат.png', mimeType: 'image/png', buffer: PNG });
  await expect(tile).toBeVisible();

  await page.getByRole('textbox', { name: 'Сообщение' }).fill('Смотри, какой закат');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(tile).toHaveCount(0);
  const sent = page.getByRole('log').getByRole('article').filter({ hasText: 'Смотри, какой закат' });
  await expect(sent.getByRole('button', { name: 'Фото' }).locator('img')).toHaveAttribute('src', /^blob:/, { timeout: 20_000 });
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await sent.getByRole('button', { name: 'Фото' }).click();
  await expect(page.getByRole('dialog', { name: 'Фото' }).locator('img')).toHaveAttribute('src', /^blob:/);
  expect(problems).toEqual([]);
});

test('вставка картинки из буфера и перетаскивание файла — в лоток, а не сразу в чат', async ({ page }) => {
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const field = page.getByRole('textbox', { name: 'Сообщение' });
  await field.click();
  await page.evaluate((bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], 'image.png', { type: 'image/png' }));
    document.querySelector('textarea')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, [...PNG]);
  await expect(page.getByRole('img', { name: 'Фото к сообщению' })).toHaveCount(1);
  await expect(field).toHaveValue('');

  const region = page.getByRole('region', { name: 'Переписка' });
  const data = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(['список дел'], 'дела.txt', { type: 'text/plain' }));
    return d;
  });
  await region.dispatchEvent('dragenter', { dataTransfer: data });
  await expect(page.getByText('Отпустите, чтобы прикрепить')).toBeVisible();
  await region.dispatchEvent('drop', { dataTransfer: data });
  await expect(page.getByText('Отпустите, чтобы прикрепить')).toBeHidden();
  await expect(page.getByRole('listitem').filter({ hasText: 'дела.txt' })).toBeVisible();
  // Ничего не ушло само.
  await expect(page.getByRole('log').getByRole('article').filter({ hasText: 'дела.txt' })).toHaveCount(0);
});

test('десктоп: Ctrl/⌘ Shift U открывает выбор файла; колесо с Ctrl приближает', async ({ page }, info) => {
  test.skip(isPhone(info.project.name), 'клавиатура и колесо — десктоп');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('textbox', { name: 'Сообщение' }).press('ControlOrMeta+Shift+U');
  await chooser;

  await page.getByRole('log').getByRole('button', { name: 'Фото' }).first().click();
  const viewer = page.getByRole('dialog', { name: 'Фото' });
  const img = viewer.locator('img');
  await expect(img).toHaveAttribute('src', /^blob:/);
  const before = (await img.boundingBox())!;
  await img.hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await img.boundingBox())!.width).toBeGreaterThan(before.width * 1.5);
  await page.keyboard.press('0');
  await expect.poll(async () => (await img.boundingBox())!.width).toBeCloseTo(before.width, 0);
});

test('телефон: свайп вниз закрывает просмотрщик', async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), 'палец');
  await signInToDemo(page);
  await openRoom(page, /^Выходные/);
  await page.getByRole('log').getByRole('button', { name: 'Фото' }).first().click();
  const viewer = page.getByRole('dialog', { name: 'Фото' });
  await expect(viewer.locator('img')).toBeVisible();
  const stage = viewer.getByRole('presentation');
  const at = (y: number) => ({ pointerId: 3, pointerType: 'touch', isPrimary: true, clientX: 200, clientY: y });
  await stage.dispatchEvent('pointerdown', at(300));
  for (const y of [320, 360, 420, 480, 520]) await stage.dispatchEvent('pointermove', at(y));
  await stage.dispatchEvent('pointerup', at(520));
  await expect(viewer).toBeHidden();
});
