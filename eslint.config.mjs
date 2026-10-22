import globals from 'globals';

const safetyRules = {
  'no-unreachable': 'error',
  'no-constant-condition': 'error',
};

export default [
  { ignores: ['build/**', 'build-*/**', 'build-js/**'] },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: safetyRules,
  },
  {
    files: ['runner/**/*.{js,cjs}', 'tools/**/*.{mjs,cjs}', 'test/**/*.cjs'],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
    rules: { ...safetyRules, 'no-undef': 'error' },
  },
  {
    files: [
      'tools/generate-*-reference.cjs',
    ],
    languageOptions: { globals: globals.browser },
  },
];
