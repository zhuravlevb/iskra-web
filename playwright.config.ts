import { defineConfig, devices } from '@playwright/test';

/**
 * Сценарии — в трёх движках, каждый в двух вьюпортах: телефон (касание, 390 px) и
 * десктоп (мышь, 1440 px). Против `vite preview`, то есть со сборкой и боевой CSP.
 *
 * `PW_CHROMIUM_PATH` — если Chromium уже стоит в системе и версия Playwright с ним
 * не совпадает (облачные контейнеры). `PW_ENGINES=chromium` — прогнать один движок.
 */
const chromiumPath = process.env['PW_CHROMIUM_PATH'];
const engines = (process.env['PW_ENGINES'] ?? 'chromium,firefox,webkit').split(',');

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const desktop = { viewport: { width: 1440, height: 900 }, hasTouch: false };

const browsers = {
  chromium: { ...devices['Desktop Chrome'], ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}) },
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
} as const;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: process.env['CI'] ? 'github' : 'list',
  // Русский пишется первым — и проверяется первым.
  use: { baseURL: 'http://localhost:4173', locale: 'ru-RU' },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  projects: engines.flatMap((engine) => {
    const browser = browsers[engine as keyof typeof browsers];
    // Firefox не умеет isMobile — для него «телефон» это узкий вьюпорт с касанием.
    const phoneFor = engine === 'firefox' ? { ...phone, isMobile: false } : phone;
    return [
      { name: `${engine}-phone`, use: { ...browser, ...phoneFor } },
      { name: `${engine}-desktop`, use: { ...browser, ...desktop } },
    ];
  }),
});
