import { defineConfig } from 'vitest/config'

// Unit tests for platform-free modules only (no react-native imports in tested files).
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
