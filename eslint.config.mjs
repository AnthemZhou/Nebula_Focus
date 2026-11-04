import {defineConfig, globalIgnores} from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  globalIgnores(['node_modules/**', 'dist/**', 'test-results/**', 'main.js', 'esbuild.config.mjs', 'scripts/**', 'tests/**', 'native-reading-ui/**']),
  ...obsidianmd.configs.recommended,
  {
    // Keep host API preferences visible, while unsafe types and correctness
    // findings remain blocking errors. These warnings are documented in
    // docs/review-warnings.md rather than suppressed in the source.
    rules: {
      'obsidianmd/prefer-create-el': 'warn',
      'obsidianmd/commands/no-default-hotkeys': 'warn',
      'obsidianmd/prefer-file-manager-trash-file': 'warn',
      'obsidianmd/ui/sentence-case': 'warn',
      '@typescript-eslint/no-deprecated': 'warn',
    },
    languageOptions: {
      parserOptions: {
        projectService: {allowDefaultProject: ['eslint.config.*']},
        tsconfigRootDir: process.cwd(),
      },
    },
  },
]);
