import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import stylistic from '@stylistic/eslint-plugin'
import importX from 'eslint-plugin-import-x'

export default defineConfig([
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  stylistic.configs.recommended,
  globalIgnores(['node_modules/**', 'dist/**', 'data/**']),
  {
    plugins: { 'import-x': importX },
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: ['vitest.config.ts'],
        },
      },
    },
    rules: {
      '@typescript-eslint/no-extraneous-class': ['off'],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@stylistic/max-statements-per-line': ['error', { max: 2 }],
      'import-x/extensions': ['error', 'always', {
        fix: true,
        checkTypeImports: true,
        pathGroupOverrides: [
          { pattern: '?*', action: 'ignore' },
          { pattern: '@*/*', action: 'ignore' },
          { pattern: 'vitest/config', action: 'ignore' },
          { pattern: 'eslint/config', action: 'ignore' },
        ],
      }],
    },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
