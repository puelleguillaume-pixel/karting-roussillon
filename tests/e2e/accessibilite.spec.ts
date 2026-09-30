// Accessibilité WCAG 2.1 AA (axe-core) sur les pages publiques et l'espace dirigeant.
// Le site propose des handikarts : aucune violation grave ou critique n'est tolérée.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  page = await context.newPage();
});
test.afterAll(async () => {
  await context.close();
});

async function audit(path: string, ready: () => Promise<void>) {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: /Préparation de la piste/ })).toHaveCount(0, { timeout: 90_000 });
  await ready();
  // Laisse finir les animations d'apparition (opacité) avant de mesurer les contrastes
  await page.waitForTimeout(800);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = serious.map((v) => `${v.id} (${v.impact}) : ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n    ')}`);
  expect(report, `${path}\n${report.join('\n')}`).toEqual([]);
}

const PUBLIC_PAGES: Array<[string, string]> = [
  ['/', 'Accueil'],
  ['/karts-tarifs', 'Karts'],
  ['/circuits', 'Circuits'],
  ['/trackday', 'Trackday'],
  ['/formules/anniversaire', 'Anniversaire'],
  ['/bon-cadeau', 'Bon cadeau'],
  ['/chronos', 'Chronos'],
  ['/contact', 'Contact'],
  ['/reserver', 'Réserver'],
  ['/mon-compte', 'Mon compte'],
];

test('bandeau cookies : consentement accessible au clavier', async () => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Préparation de la piste/ })).toHaveCount(0, { timeout: 90_000 });
  const refuse = page.getByRole('button', { name: 'Tout refuser' });
  await expect(refuse).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tout accepter' })).toBeVisible();
  await refuse.focus();
  await page.keyboard.press('Enter');
  await expect(refuse).toHaveCount(0);
});

for (const [path, name] of PUBLIC_PAGES) {
  test(`${name} (${path}) : aucune violation WCAG AA grave`, async () => {
    await audit(path, async () => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  });
}

test('parcours de réservation, étape créneau : aucune violation WCAG AA grave', async () => {
  await audit('/reserver?produit=session-sodikart-390&etape=2', async () => {
    await expect(page.locator('main button[aria-pressed]').first()).toBeVisible();
  });
});

test('espace dirigeant (planning) : aucune violation WCAG AA grave', async () => {
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Dirigeant (tous les accès)' }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  for (const path of ['/admin', '/admin/planning', '/admin/reservations', '/admin/demandes']) {
    await audit(path, async () => {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }
});

test('navigation au clavier : lien d’évitement vers le contenu', async () => {
  await page.goto('/karts-tarifs');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 90_000 });
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Aller au contenu' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contenu')).toBeFocused();
});
