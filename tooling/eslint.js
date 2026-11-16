import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ignores = { ignores: ['dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**'] };

const typescript = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];

/** Backend rule "no free functions": logic lives in class methods (config files, main.ts and tests are exempt). */
const classRules = {
  files: ['src/**/*.ts'],
  ignores: ['src/main.ts', '**/*.test.ts', '**/*.config.ts', '**/config.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'Program > FunctionDeclaration, Program > ExportNamedDeclaration > FunctionDeclaration',
        message: 'No free functions: put the logic in a class method (see .claude/rules/backend.md).',
      },
      {
        selector:
          'Program > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression, Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression',
        message: 'No free functions: put the logic in a class method (see .claude/rules/backend.md).',
      },
    ],
  },
};

/** Onion layers of a backend service: domain <- infra, domain <- app; only *.module.ts wires infra. */
const layerRules = {
  files: ['src/**/*.ts'],
  plugins: { boundaries },
  settings: {
    'boundaries/elements': [
      { type: 'domain', pattern: 'src/domain' },
      { type: 'infra', pattern: 'src/infra' },
      { type: 'app', pattern: 'src/app' },
    ],
    'boundaries/files': [{ pattern: '**/*.module.ts', category: 'wiring' }],
    'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js'] } },
  },
  rules: {
    'boundaries/dependencies': [
      'error',
      {
        default: 'allow',
        policies: [
          {
            from: { element: { type: 'domain' } },
            disallow: { to: { element: { types: ['infra', 'app'] } } },
            message: 'domain/ imports only kernel, contracts and other domain/ files.',
          },
          {
            from: { element: { type: 'infra' } },
            disallow: { to: { element: { type: 'app' } } },
            message: 'infra/ never imports app/.',
          },
          {
            from: { element: { type: 'app' } },
            disallow: { to: { element: { type: 'infra' } } },
            message: 'app/ reaches infra/ only through *.module.ts wiring.',
          },
          {
            from: { element: { type: 'app' }, file: { categories: 'wiring' } },
            allow: { to: { element: { type: 'infra' } } },
          },
        ],
      },
    ],
  },
};

const domainPurity = {
  files: ['src/domain/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: ['@nestjs/*', '@langchain/*', 'pino', 'node:*', 'zod'], message: 'domain/ is framework-free.' },
        ],
      },
    ],
  },
};

export function backendConfig() {
  return tseslint.config(ignores, ...typescript, classRules, layerRules, domainPurity);
}

export function packageConfig({ classes = true } = {}) {
  return tseslint.config(ignores, ...typescript, ...(classes ? [classRules] : []));
}

export function webConfig(extra = []) {
  return tseslint.config(
    ignores,
    ...typescript,
    { languageOptions: { globals: { ...globals.browser } } },
    ...extra,
  );
}
