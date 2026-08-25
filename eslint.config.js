// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    rules: {
      // i18next's default export is the shared singleton instance; using its
      // members (e.g. i18next.t) across app modules is intentional.
      'import/no-named-as-default-member': 'off',
    },
  },
]);
