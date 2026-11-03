// Controllo del codice: le regole consigliate di ESLint, con l'ambiente giusto per ogni parte.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist', 'dist-remote', 'node_modules'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error'
    }
  },
  { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['public/sw.js'], languageOptions: { sourceType: 'script', globals: globals.serviceworker } },
  { files: ['netlify/**/*.mjs', 'tests/**/*.{js,mjs}', '*.config.js'], languageOptions: { globals: globals.node } },
  // I test e2e eseguono codice anche dentro la pagina.
  { files: ['tests/e2e.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } }
];
