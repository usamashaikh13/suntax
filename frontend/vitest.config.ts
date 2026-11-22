import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.{ts,tsx,js,jsx}'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/.next/**'],
    globals: true,
    passWithNoTests: true,
  },
});
