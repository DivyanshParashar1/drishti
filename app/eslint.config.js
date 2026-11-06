// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Metro bundles assets only through static require() calls.
    files: ['src/models/detectorAssets.ts', 'src/audio/clips.generated.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
