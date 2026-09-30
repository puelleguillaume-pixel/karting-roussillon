import { defineConfig, devices } from '@playwright/test';

// Tests de bout en bout sur la version de production (dist/, mode démo) servie
// comme sur Netlify (scripts/serve-dist.mjs : redirections, en-têtes, CSP).
// Navigateur : Microsoft Edge installé sur le poste (PW_CHANNEL=chrome pour Chrome).
// Prérequis : npm run build.  Lancement : npm run test:e2e
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? 'msedge',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'ordinateur', use: { viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: process.env.PW_CHANNEL ?? 'msedge' }, grep: /@mobile/ },
  ],
  webServer: {
    command: `node scripts/serve-dist.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
});
