import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { chromium } from 'playwright';

const chromiumExecutablePath = chromium.executablePath();
const resolvedChromiumExecutablePath =
  process.arch === 'arm64'
    ? chromiumExecutablePath.replace('mac-x64', 'mac-arm64')
    : chromiumExecutablePath;

export default defineConfig({
  test: {
    globals: true,
    include: ['test/browser/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          executablePath: resolvedChromiumExecutablePath,
          headless: true,
        },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
