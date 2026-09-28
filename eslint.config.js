import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

/**
 * Границы слоёв — правило, проверяемое машиной, а не памятью:
 *
 * | src/core/     | Matrix, без компонентов   | никогда `.svelte`, design/, features/ |
 * | src/design/   | компоненты, токены        | никогда Matrix, core/, features/      |
 * | src/features/ | экраны                    | оба — единственное место встречи      |
 *
 * Сделано встроенным `no-restricted-imports` по каталогам: три правила, которые
 * читаются глазами, против плагина с собственным языком описания.
 */
const matrix = ['matrix-js-sdk', 'matrix-js-sdk/*', 'matrix-encrypt-attachment', '@matrix-org/*'];

export default ts.config(
  { ignores: ['dist/', 'dev-dist/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Ничего не логируется (см. план, «Безопасность»). Исключения — только явные.
      'no-console': 'error',
    },
  },
  {
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['*.svelte'], message: 'core/ никогда не импортирует компоненты.' },
            { group: ['**/design/**', '**/features/**'], message: 'core/ не знает про design/ и features/.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/design/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: matrix, message: 'design/ никогда не трогает Matrix.' },
            { group: ['**/core/**', '**/features/**'], message: 'design/ не знает про core/ и features/.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/i18n/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: [...matrix, '**/core/**', '**/design/**', '**/features/**'], message: 'i18n/ — только тексты.' }] },
      ],
    },
  },
  {
    // Логгер SDK — единственное место, откуда предупреждения и ошибки идут в консоль.
    files: ['src/core/support/logger.ts', 'tests/**', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },
);
