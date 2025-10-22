// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const eslintConfigPrettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  // ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript ESLint recommended rules
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Prettier config to disable conflicting rules
  eslintConfigPrettier,

  // Global ignores
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.js',
      '*.mjs',
      'lib/test/**',
      'lib/test/**/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      'eslint.config.cjs', // Ignore config file itself
      '*.md',
    ],
  },

  // Base configuration
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', '*.mjs', '*.cjs'],
        },
        tsconfigRootDir: __dirname,
      },
    },
  },

  // Custom rules
  {
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/method-signature-style': 'off',

      // Relax some strict TypeScript rules for decorator metadata
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'off',

      // Allow empty interfaces (common in TypeScript patterns)
      '@typescript-eslint/no-empty-interface': 'off',

      // Allow require() in specific cases (Bun compatibility)
      '@typescript-eslint/no-require-imports': 'off',

      // Disable rules that require strictNullChecks (tsconfig has strict: false)
      '@typescript-eslint/prefer-nullish-coalescing': 'off',

      // Allow any in union types (common in adapter interfaces)
      '@typescript-eslint/no-redundant-type-constituents': 'off',

      // Allow index signatures (common in dynamic interfaces)
      '@typescript-eslint/consistent-indexed-object-style': 'off',

      // Allow async functions without await (common in interface implementations)
      '@typescript-eslint/require-await': 'off',

      // Allow flexible generic constructors
      '@typescript-eslint/consistent-generic-constructors': 'off',
    },
  },
);
