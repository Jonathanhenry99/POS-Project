import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Satu database bersama: jalankan file tes berurutan.
    fileParallelism: false,
  },
});
