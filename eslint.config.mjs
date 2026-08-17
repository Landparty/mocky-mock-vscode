// ESLint flat config. Type-aware linting is scoped to the three real TS
// projects in this repo (src/, media/paragraphTree, media/programFlow),
// matching how `npm run check-types` already builds them separately.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'node_modules/**',
      'bin/**',
      '.worktrees/**',
      'examples/**',
      '**/*.vsix',
      'scripts/.local/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Classic `project` (not `projectService`): tsconfig.json's own
    // `exclude: ["**/*.test.ts"]` keeps test files out of the main
    // check-types build, so linting needs the separate tsconfig.eslint.json
    // that includes them (see that file's own comment).
    files: ['src/**/*.ts', 'media/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.eslint.json',
          './media/paragraphTree/tsconfig.json',
          './media/programFlow/tsconfig.json'
        ],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    files: ['media/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser }
    }
  },
  {
    // Plain node/CommonJS dev scripts, not part of the compiled extension.
    files: ['scripts/**/*.js', 'esbuild.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
);
