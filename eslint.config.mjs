import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.open-next/**',
      '**/.wrangler/**',
      '**/next-env.d.ts',
      '**/*.generated.ts',
      'reference/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node build scripts and ESM config files run under Node, not the browser.
    files: ['**/*.mjs', '**/scripts/**'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
);
